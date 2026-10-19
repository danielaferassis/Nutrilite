"""Autenticação por sessão (cookie HttpOnly) e autorização por funcionalidade.

Uso nos routers:
    Depends(get_usuario_atual)                 # exige login
    Depends(requer_permissao("usuario.gerenciar"))  # exige login + permissão
"""

import logging
import threading
import time
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import column, delete, literal, or_, select, table
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.models import Sessao, Usuario
from app.security import gerar_token, hash_token

log = logging.getLogger(__name__)

OCIOSIDADE = timedelta(minutes=settings.sessao_ociosa_minutos)
DURACAO_MAXIMA = timedelta(days=settings.sessao_maxima_dias)
# Evita um UPDATE por requisição: ultimo_uso só é gravado se mudou mais que isso
INTERVALO_ATUALIZACAO = timedelta(minutes=1)

# View criada na migration de controle de acesso (não é um model)
_vw_permissao = table(
    "vw_permissao_usuario", column("usuario_id"), column("funcionalidade_codigo")
)


def agora_utc() -> datetime:
    # As colunas DateTime do MySQL não guardam fuso: gravamos sempre UTC sem tzinfo
    return datetime.now(UTC).replace(tzinfo=None)


def _ip(request: Request) -> str | None:
    # Atrás do Caddy o uvicorn roda com --proxy-headers, então este é o IP real
    return request.client.host if request.client else None


# --- Sessões ---


def criar_sessao(db: Session, usuario: Usuario, request: Request) -> str:
    """Cria a sessão e devolve o token que vai no cookie (só o hash é gravado)."""
    agora = agora_utc()
    # Aproveita o login para limpar sessões vencidas de todos os usuários
    db.execute(
        delete(Sessao).where(
            or_(Sessao.expira_em <= agora, Sessao.ultimo_uso <= agora - OCIOSIDADE)
        )
    )
    token = gerar_token()
    db.add(
        Sessao(
            usuario_id=usuario.id,
            token_hash=hash_token(token),
            ip=_ip(request),
            user_agent=(request.headers.get("user-agent") or "")[:255] or None,
            ultimo_uso=agora,
            expira_em=agora + DURACAO_MAXIMA,
        )
    )
    return token


def encerrar_sessoes(db: Session, usuario_id: int, exceto_id: int | None = None) -> None:
    """Derruba as sessões do usuário (ex.: troca de senha, usuário desativado)."""
    query = delete(Sessao).where(Sessao.usuario_id == usuario_id)
    if exceto_id is not None:
        query = query.where(Sessao.id != exceto_id)
    db.execute(query)


def definir_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.sessao_cookie,
        token,
        max_age=int(DURACAO_MAXIMA.total_seconds()),
        path="/api",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
    )


def remover_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.sessao_cookie,
        path="/api",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
    )


def buscar_sessao(request: Request, db: Session) -> Sessao | None:
    token = request.cookies.get(settings.sessao_cookie)
    if not token:
        return None
    return db.scalar(
        select(Sessao)
        .options(joinedload(Sessao.usuario))
        .where(Sessao.token_hash == hash_token(token))
    )


def encerrar_sessao_do_cookie(request: Request, db: Session) -> int | None:
    """Apaga a sessão do cookie, se existir, e devolve o id do usuário dono dela."""
    sessao = buscar_sessao(request, db)
    if sessao is None:
        return None
    usuario_id = sessao.usuario_id
    db.delete(sessao)
    db.flush()
    return usuario_id


# --- Dependências ---


def get_sessao_atual(request: Request, db: Session = Depends(get_db)) -> Sessao:
    sessao = buscar_sessao(request, db)
    if sessao is None:
        raise HTTPException(status_code=401, detail="Não autenticado")

    agora = agora_utc()
    vencida = sessao.expira_em <= agora or sessao.ultimo_uso + OCIOSIDADE <= agora
    if vencida or not sessao.usuario.ativo:
        db.delete(sessao)
        db.commit()
        raise HTTPException(status_code=401, detail="Sessão expirada")

    if agora - sessao.ultimo_uso > INTERVALO_ATUALIZACAO:
        sessao.ultimo_uso = agora
        db.commit()
    return sessao


def get_usuario_atual(sessao: Sessao = Depends(get_sessao_atual)) -> Usuario:
    return sessao.usuario


def listar_permissoes(usuario_id: int, db: Session) -> list[str]:
    return list(
        db.scalars(
            select(_vw_permissao.c.funcionalidade_codigo)
            .where(_vw_permissao.c.usuario_id == usuario_id)
            .order_by(_vw_permissao.c.funcionalidade_codigo)
        ).all()
    )


def requer_permissao(codigo: str):
    """Dependência que exige login e a funcionalidade `codigo` em algum grupo ativo."""

    def dependencia(
        usuario: Usuario = Depends(get_usuario_atual), db: Session = Depends(get_db)
    ) -> Usuario:
        permitido = db.scalar(
            select(literal(1))
            .select_from(_vw_permissao)
            .where(
                _vw_permissao.c.usuario_id == usuario.id,
                _vw_permissao.c.funcionalidade_codigo == codigo,
            )
            .limit(1)
        )
        if permitido is None:
            log.warning("Usuário %s sem permissão %s", usuario.id, codigo)
            raise HTTPException(status_code=403, detail="Sem permissão")
        return usuario

    return dependencia


METODOS_SEGUROS = {"GET", "HEAD", "OPTIONS"}


def verificar_origem(request: Request) -> None:
    """Proteção contra CSRF, complementar ao SameSite=Strict do cookie.

    Requisições que alteram dados só são aceitas se vierem do próprio site.
    Clientes que não são navegador (curl, scripts) não mandam esses headers e passam.
    """
    if request.method in METODOS_SEGUROS:
        return
    # Header enviado por todos os navegadores atuais; independe de proxy reescrever o Host
    fetch_site = request.headers.get("sec-fetch-site")
    if fetch_site is not None:
        permitido = fetch_site in ("same-origin", "none")
    else:
        origem = request.headers.get("origin")
        permitido = origem is None or origem.split("://", 1)[-1] == request.headers.get("host")
    if not permitido:
        log.warning("Requisição %s %s de outra origem bloqueada", request.method, request.url.path)
        raise HTTPException(status_code=403, detail="Origem não permitida")


# --- Limite de tentativas de login ---


class LimiteTentativas:
    """Conta falhas por chave numa janela de tempo, em memória.

    Funciona porque o backend roda em um único processo; com vários workers
    cada um teria a própria contagem. Reiniciar o backend zera as contagens.
    """

    def __init__(self, maximo: int, janela: timedelta):
        self.maximo = maximo
        self.janela = janela.total_seconds()
        self._falhas: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def _recentes(self, chave: str, agora: float) -> list[float]:
        falhas = [t for t in self._falhas.get(chave, []) if agora - t < self.janela]
        if falhas:
            self._falhas[chave] = falhas
        else:
            self._falhas.pop(chave, None)
        return falhas

    def bloqueado(self, chave: str) -> bool:
        with self._lock:
            return len(self._recentes(chave, time.monotonic())) >= self.maximo

    def registrar_falha(self, chave: str) -> None:
        with self._lock:
            agora = time.monotonic()
            # Evita crescer sem limite com chaves aleatórias
            if len(self._falhas) > 10_000:
                for antiga in list(self._falhas):
                    self._recentes(antiga, agora)
            self._falhas[chave] = self._recentes(chave, agora) + [agora]

    def limpar(self, chave: str) -> None:
        with self._lock:
            self._falhas.pop(chave, None)
