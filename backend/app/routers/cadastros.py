"""Cadastro da secagem: ervas, secadores, capacidades e rendimentos.

Leitura só exige login: a Fonte fornecedora também escolhe a erva da
previsão. Escrita exige `cadastro.gerenciar`.

- Erva e secador não são removidos: saem do planejamento com `ativo=false`.
  Demandas, previsões e recebimentos apontam para eles.
- Capacidade pode ser removida: sem a linha, a erva não opera naquele secador.
- Parâmetro vazio é gravado como nulo ("não informado"), nunca como zero.
  A simulação acusa PARAM_AUSENTE.
- Planos salvos guardam códigos como texto (fotografia): alterar o cadastro
  depois não muda um plano já aprovado.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.acesso import get_usuario_atual, requer_permissao
from app.database import get_db
from app.models import Capacidade, Erva, Rendimento, Secador, Usuario
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


def _aplicar(registro, campos: dict) -> None:
    for campo, valor in campos.items():
        setattr(registro, campo, valor)


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
    db.commit()
    db.refresh(erva)
    log.info("Erva %s atualizada por %s: %s", erva.id, usuario.id, sorted(campos))
    return erva


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
    _aplicar(secador, campos)
    db.commit()
    db.refresh(secador)
    log.info("Secador %s atualizado por %s: %s", secador.id, usuario.id, sorted(campos))
    return secador


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
