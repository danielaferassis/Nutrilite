import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.acesso import (
    LimiteTentativas,
    agora_utc,
    criar_sessao,
    definir_cookie,
    encerrar_sessao_do_cookie,
    encerrar_sessoes,
    get_sessao_atual,
    listar_permissoes,
    remover_cookie,
)
from app.database import get_db
from app.models import Sessao, Usuario
from app.schemas import AlterarSenha, LoginRequest, SessaoAtual
from app.security import HASH_FALSO, hash_senha, precisa_rehash, verificar_senha

log = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Por e-mail freia ataque a uma conta; por IP freia quem testa muitas contas
limite_por_email = LimiteTentativas(maximo=5, janela=timedelta(minutes=15))
limite_por_ip = LimiteTentativas(maximo=20, janela=timedelta(minutes=15))

CREDENCIAIS_INVALIDAS = "E-mail ou senha inválidos"


def montar_sessao_atual(usuario: Usuario, db: Session) -> SessaoAtual:
    return SessaoAtual(usuario=usuario, permissoes=listar_permissoes(usuario.id, db))


@router.post("/login", response_model=SessaoAtual)
def login(data: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "desconhecido"
    if limite_por_email.bloqueado(data.email) or limite_por_ip.bloqueado(ip):
        log.warning("Login bloqueado por excesso de tentativas: %s / %s", data.email, ip)
        raise HTTPException(
            status_code=429, detail="Muitas tentativas. Tente novamente em alguns minutos."
        )

    usuario = db.scalar(select(Usuario).where(Usuario.email == data.email))
    # Verifica mesmo sem usuário para não revelar, pelo tempo de resposta, se o e-mail existe
    senha_ok = verificar_senha(usuario.senha_hash if usuario else HASH_FALSO, data.senha)
    if usuario is None or not senha_ok or not usuario.ativo:
        limite_por_email.registrar_falha(data.email)
        limite_por_ip.registrar_falha(ip)
        log.warning("Falha de login para %s a partir de %s", data.email, ip)
        raise HTTPException(status_code=401, detail=CREDENCIAIS_INVALIDAS)

    limite_por_email.limpar(data.email)
    if precisa_rehash(usuario.senha_hash):
        usuario.senha_hash = hash_senha(data.senha)
    usuario.ultimo_login = agora_utc()

    # Se o navegador já tinha uma sessão, ela é descartada (evita fixação de sessão)
    encerrar_sessao_do_cookie(request, db)
    token = criar_sessao(db, usuario, request)
    db.commit()
    definir_cookie(response, token)
    log.info("Login do usuário %s", usuario.id)
    return montar_sessao_atual(usuario, db)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    # Não exige sessão válida: sempre limpa o cookie
    usuario_id = encerrar_sessao_do_cookie(request, db)
    if usuario_id is not None:
        db.commit()
        log.info("Logout do usuário %s", usuario_id)
    remover_cookie(response)


@router.get("/me", response_model=SessaoAtual)
def me(sessao: Sessao = Depends(get_sessao_atual), db: Session = Depends(get_db)):
    return montar_sessao_atual(sessao.usuario, db)


@router.post("/senha", status_code=204)
def alterar_senha(
    data: AlterarSenha, sessao: Sessao = Depends(get_sessao_atual), db: Session = Depends(get_db)
):
    usuario = sessao.usuario
    if limite_por_email.bloqueado(usuario.email):
        raise HTTPException(
            status_code=429, detail="Muitas tentativas. Tente novamente em alguns minutos."
        )
    if not verificar_senha(usuario.senha_hash, data.senha_atual):
        limite_por_email.registrar_falha(usuario.email)
        raise HTTPException(status_code=400, detail="Senha atual incorreta")

    usuario.senha_hash = hash_senha(data.nova_senha)
    # Derruba os outros dispositivos; a sessão atual continua
    encerrar_sessoes(db, usuario.id, exceto_id=sessao.id)
    db.commit()
    log.info("Usuário %s alterou a própria senha", usuario.id)
