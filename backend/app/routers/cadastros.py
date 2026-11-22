"""Cadastro da secagem: ervas, secadores, capacidades e rendimentos.

Leitura só exige login: a Fonte fornecedora também escolhe a erva da
previsão. Escrita exige `cadastro.gerenciar`.

- Erva e secador saem do planejamento com `ativo=false`. Só podem ser
  excluídos se nunca foram usados (nenhuma demanda, previsão, recebimento,
  apontamento, bloqueio ou plano); senão a exclusão é recusada (409), para
  não apagar histórico. A capacidade e o rendimento deles saem junto.
- Capacidade pode ser removida: sem a linha, a erva não opera naquele secador.
- Parâmetro vazio é gravado como nulo ("não informado"), nunca como zero.
  A simulação acusa PARAM_AUSENTE.
- Planos salvos guardam códigos como texto (fotografia): alterar o cadastro
  depois não muda um plano já aprovado.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.acesso import get_usuario_atual, requer_permissao
from app.database import get_db
from app.texto import normalizar
from app.models import (
    ApontamentoSecagem,
    BloqueioSecador,
    Capacidade,
    Demanda,
    Erva,
    PlanoAlocacao,
    PrevisaoOferta,
    Recebimento,
    Rendimento,
    Secador,
    Usuario,
)
from app.schemas import (
    CapacidadeCreate,
    CapacidadeRead,
    CapacidadeUpdate,
    ErvaCreate,
    ErvaRead,
    ErvaUpdate,
    RendimentoCreate,
    RendimentoRead,
    RendimentoUpdate,
    SecadorCreate,
    SecadorRead,
    SecadorUpdate,
)

log = logging.getLogger(__name__)

router = APIRouter(tags=["cadastros"], dependencies=[Depends(get_usuario_atual)])

pode_gerenciar = requer_permissao("cadastro.gerenciar")


def _get_or_404(modelo, registro_id: int, mensagem: str, db: Session):
    registro = db.get(modelo, registro_id)
    if registro is None:
        log.warning("%s: id %s", mensagem, registro_id)
        raise HTTPException(status_code=404, detail=mensagem)
    return registro


def _referencia_ou_422(modelo, registro_id: int, mensagem: str, db: Session):
    # Id que vem no corpo e não existe é dado inválido (422), não rota inexistente (404)
    registro = db.get(modelo, registro_id)
    if registro is None:
        raise HTTPException(status_code=422, detail=mensagem)
    return registro


def _ensure_codigo_livre(modelo, codigo: str, registro_id: int | None, nome: str, db: Session) -> None:
    # Checado antes do banco para responder com mensagem clara, não com erro de unicidade
    existente = db.scalar(select(modelo).where(modelo.codigo == codigo))
    if existente is not None and existente.id != registro_id:
        raise HTTPException(status_code=409, detail=f"Já existe {nome} com o código {codigo}")


def _ensure_codigo_infinity_livre(codigo: str | None, secador_id: int | None, db: Session) -> None:
    # A importação compara sem acento e sem caixa: dois secadores não podem colidir assim
    if codigo is None:
        return
    for outro in db.scalars(select(Secador).where(Secador.codigo_infinity.is_not(None))):
        if outro.id != secador_id and normalizar(outro.codigo_infinity) == normalizar(codigo):
            raise HTTPException(
                status_code=409,
                detail=f"O código do Infinity {codigo!r} já está no secador {outro.codigo}",
            )


def _aplicar(registro, campos: dict) -> None:
    for campo, valor in campos.items():
        setattr(registro, campo, valor)


SETUPS = (("setup_inicial_h", "inicial"), ("setup_final_h", "final"), ("setup_diario_h", "diário"))


def _ensure_setups_cabem_no_regime(capacidades: list[Capacidade], erva: Erva) -> None:
    """422 se um setup feito dentro do regime passa das horas de regime da erva.

    Ex.: setup diário de 13 h numa erva de 12 h/dia: nunca sobraria hora para secar.
    Sem regime cadastrado não há o que comparar (o motor já aponta PARAM_AUSENTE).
    """
    if erva.regime_horas_dia is None:
        return
    for capacidade in capacidades:
        if not capacidade.setup_dentro_do_regime:
            continue
        for campo, rotulo in SETUPS:
            horas = getattr(capacidade, campo)
            if horas is not None and horas > erva.regime_horas_dia:
                secador = capacidade.secador.codigo if capacidade.secador else f"secador {capacidade.secador_id}"
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"O setup {rotulo} de {erva.nome} no {secador} ({horas} h) passa do regime "
                        f"da erva ({erva.regime_horas_dia} h/dia) e é feito dentro do regime"
                    ),
                )


def _recusar_se_usado(nome: str, usos: list[tuple[str, int]]) -> None:
    """409 se o registro já foi usado em algo que é histórico; desativar é o caminho."""
    usados = [f"{qtd} {rotulo}" for rotulo, qtd in usos if qtd]
    if usados:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Não dá para excluir {nome}: já tem {', '.join(usados)}. "
                "Deixe inativo para tirar do planejamento sem perder o histórico."
            ),
        )


def _contar(db: Session, modelo, condicao) -> int:
    return db.scalar(select(func.count()).select_from(modelo).where(condicao)) or 0


# --- Ervas ---


@router.get("/ervas", response_model=list[ErvaRead])
def list_ervas(ativos: bool = True, db: Session = Depends(get_db)):
    query = select(Erva).order_by(Erva.nome)
    if ativos:
        query = query.where(Erva.ativo.is_(True))
    return db.scalars(query).all()


@router.post("/ervas", response_model=ErvaRead, status_code=201)
def create_erva(
    data: ErvaCreate, usuario: Usuario = Depends(pode_gerenciar), db: Session = Depends(get_db)
):
    _ensure_codigo_livre(Erva, data.codigo, None, "erva", db)
    erva = Erva(**data.model_dump())
    db.add(erva)
    db.commit()
    db.refresh(erva)
    log.info("Erva %s (%s) criada por %s", erva.id, erva.codigo, usuario.id)
    return erva


@router.patch("/ervas/{erva_id}", response_model=ErvaRead)
def update_erva(
    erva_id: int,
    data: ErvaUpdate,
    usuario: Usuario = Depends(pode_gerenciar),
    db: Session = Depends(get_db),
):
    erva = _get_or_404(Erva, erva_id, "Erva não encontrada", db)
    campos = data.model_dump(exclude_unset=True)
    if "codigo" in campos:
        _ensure_codigo_livre(Erva, campos["codigo"], erva.id, "erva", db)
    _aplicar(erva, campos)
    if "regime_horas_dia" in campos:
        _ensure_setups_cabem_no_regime(
            db.scalars(select(Capacidade).where(Capacidade.erva_id == erva.id)).all(), erva
        )
    db.commit()
    db.refresh(erva)
    log.info("Erva %s atualizada por %s: %s", erva.id, usuario.id, sorted(campos))
    return erva


@router.delete("/ervas/{erva_id}", status_code=204)
def delete_erva(erva_id: int, usuario: Usuario = Depends(pode_gerenciar), db: Session = Depends(get_db)):
    erva = _get_or_404(Erva, erva_id, "Erva não encontrada", db)
    _recusar_se_usado(
        f"a erva {erva.nome}",
        [
            ("demanda(s)", _contar(db, Demanda, Demanda.erva_id == erva.id)),
            ("previsão(ões)", _contar(db, PrevisaoOferta, PrevisaoOferta.erva_id == erva.id)),
            ("recebimento(s)", _contar(db, Recebimento, Recebimento.erva_id == erva.id)),
            ("apontamento(s) do Infinity", _contar(db, ApontamentoSecagem, ApontamentoSecagem.erva_id == erva.id)),
            # Plano guarda o código como texto: conta mesmo assim, é histórico
            ("linha(s) em planos salvos", _contar(db, PlanoAlocacao, PlanoAlocacao.erva == erva.codigo)),
        ],
    )
    # Configuração dela sai junto: capacidades nos secadores e rendimento
    db.execute(delete(Capacidade).where(Capacidade.erva_id == erva.id))
    db.execute(delete(Rendimento).where(Rendimento.erva_id == erva.id))
    db.delete(erva)
    db.commit()
    log.info("Erva %s (%s) excluída por %s", erva_id, erva.codigo, usuario.id)


# --- Secadores ---


@router.get("/secadores", response_model=list[SecadorRead])
def list_secadores(ativos: bool = True, db: Session = Depends(get_db)):
    query = select(Secador).order_by(Secador.codigo)
    if ativos:
        query = query.where(Secador.ativo.is_(True))
    return db.scalars(query).all()


@router.post("/secadores", response_model=SecadorRead, status_code=201)
def create_secador(
    data: SecadorCreate, usuario: Usuario = Depends(pode_gerenciar), db: Session = Depends(get_db)
):
    _ensure_codigo_livre(Secador, data.codigo, None, "secador", db)
    _ensure_codigo_infinity_livre(data.codigo_infinity, None, db)
    secador = Secador(**data.model_dump())
    db.add(secador)
    db.commit()
    db.refresh(secador)
    log.info("Secador %s (%s) criado por %s", secador.id, secador.codigo, usuario.id)
    return secador


@router.patch("/secadores/{secador_id}", response_model=SecadorRead)
def update_secador(
    secador_id: int,
    data: SecadorUpdate,
    usuario: Usuario = Depends(pode_gerenciar),
    db: Session = Depends(get_db),
):
    secador = _get_or_404(Secador, secador_id, "Secador não encontrado", db)
    campos = data.model_dump(exclude_unset=True)
    if "codigo" in campos:
        _ensure_codigo_livre(Secador, campos["codigo"], secador.id, "secador", db)
    if "codigo_infinity" in campos:
        _ensure_codigo_infinity_livre(campos["codigo_infinity"], secador.id, db)
    _aplicar(secador, campos)
    db.commit()
    db.refresh(secador)
    log.info("Secador %s atualizado por %s: %s", secador.id, usuario.id, sorted(campos))
    return secador


@router.delete("/secadores/{secador_id}", status_code=204)
def delete_secador(
    secador_id: int, usuario: Usuario = Depends(pode_gerenciar), db: Session = Depends(get_db)
):
    secador = _get_or_404(Secador, secador_id, "Secador não encontrado", db)
    _recusar_se_usado(
        f"o secador {secador.codigo}",
        [
            ("bloqueio(s)", _contar(db, BloqueioSecador, BloqueioSecador.secador_id == secador.id)),
            ("apontamento(s) do Infinity", _contar(db, ApontamentoSecagem, ApontamentoSecagem.secador_id == secador.id)),
            ("linha(s) em planos salvos", _contar(db, PlanoAlocacao, PlanoAlocacao.secador == secador.codigo)),
        ],
    )
    db.execute(delete(Capacidade).where(Capacidade.secador_id == secador.id))
    db.delete(secador)
    db.commit()
    log.info("Secador %s (%s) excluído por %s", secador_id, secador.codigo, usuario.id)


# --- Capacidades (erva × secador) ---


@router.get("/capacidades", response_model=list[CapacidadeRead])
def list_capacidades(db: Session = Depends(get_db)):
    # Campos nulos vão como null: a tela mostra "não informado", nunca zero
    return db.scalars(select(Capacidade).order_by(Capacidade.erva_id, Capacidade.secador_id)).all()


@router.post("/capacidades", response_model=CapacidadeRead, status_code=201)
def create_capacidade(
    data: CapacidadeCreate, usuario: Usuario = Depends(pode_gerenciar), db: Session = Depends(get_db)
):
    # Erva ou secador inativo também aceita: o cadastro pode ser preparado antes de ativar
    erva = _referencia_ou_422(Erva, data.erva_id, "Erva inexistente", db)
    secador = _referencia_ou_422(Secador, data.secador_id, "Secador inexistente", db)
    existente = db.scalar(
        select(Capacidade).where(
            Capacidade.erva_id == data.erva_id, Capacidade.secador_id == data.secador_id
        )
    )
    if existente is not None:
        raise HTTPException(
            status_code=409,
            detail=f"{erva.nome} já tem capacidade cadastrada no {secador.codigo}",
        )
    capacidade = Capacidade(**data.model_dump())
    capacidade.secador = secador
    _ensure_setups_cabem_no_regime([capacidade], erva)
    db.add(capacidade)
    db.commit()
    db.refresh(capacidade)
    log.info(
        "Capacidade %s (%s × %s) criada por %s", capacidade.id, erva.codigo, secador.codigo, usuario.id
    )
    return capacidade


@router.patch("/capacidades/{capacidade_id}", response_model=CapacidadeRead)
def update_capacidade(
    capacidade_id: int,
    data: CapacidadeUpdate,
    usuario: Usuario = Depends(pode_gerenciar),
    db: Session = Depends(get_db),
):
    capacidade = _get_or_404(Capacidade, capacidade_id, "Capacidade não encontrada", db)
    campos = data.model_dump(exclude_unset=True)
    _aplicar(capacidade, campos)
    _ensure_setups_cabem_no_regime([capacidade], capacidade.erva)
    db.commit()
    db.refresh(capacidade)
    log.info("Capacidade %s atualizada por %s: %s", capacidade.id, usuario.id, sorted(campos))
    return capacidade


@router.delete("/capacidades/{capacidade_id}", status_code=204)
def delete_capacidade(
    capacidade_id: int, usuario: Usuario = Depends(pode_gerenciar), db: Session = Depends(get_db)
):
    capacidade = _get_or_404(Capacidade, capacidade_id, "Capacidade não encontrada", db)
    db.delete(capacidade)
    db.commit()
    log.info("Capacidade %s removida por %s", capacidade_id, usuario.id)


# --- Rendimentos (um por erva) ---


@router.get("/rendimentos", response_model=list[RendimentoRead])
def list_rendimentos(db: Session = Depends(get_db)):
    return db.scalars(select(Rendimento).order_by(Rendimento.erva_id)).all()


@router.post("/rendimentos", response_model=RendimentoRead, status_code=201)
def create_rendimento(
    data: RendimentoCreate, usuario: Usuario = Depends(pode_gerenciar), db: Session = Depends(get_db)
):
    erva = _referencia_ou_422(Erva, data.erva_id, "Erva inexistente", db)
    if db.scalar(select(Rendimento).where(Rendimento.erva_id == data.erva_id)) is not None:
        raise HTTPException(status_code=409, detail=f"{erva.nome} já tem rendimento cadastrado")
    rendimento = Rendimento(**data.model_dump())
    db.add(rendimento)
    db.commit()
    db.refresh(rendimento)
    log.info("Rendimento %s (%s) criado por %s", rendimento.id, erva.codigo, usuario.id)
    return rendimento


@router.patch("/rendimentos/{rendimento_id}", response_model=RendimentoRead)
def update_rendimento(
    rendimento_id: int,
    data: RendimentoUpdate,
    usuario: Usuario = Depends(pode_gerenciar),
    db: Session = Depends(get_db),
):
    rendimento = _get_or_404(Rendimento, rendimento_id, "Rendimento não encontrado", db)
    campos = data.model_dump(exclude_unset=True)
    _aplicar(rendimento, campos)
    db.commit()
    db.refresh(rendimento)
    log.info("Rendimento %s atualizado por %s: %s", rendimento.id, usuario.id, sorted(campos))
    return rendimento
