"""Bloqueios de secador: períodos de parada (manutenção, feriado...)."""

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.acesso import requer_permissao
from app.database import get_db
from app.models import BloqueioSecador, Secador, Usuario
from app.schemas import BloqueioCreate, BloqueioRead, BloqueioUpdate

log = logging.getLogger(__name__)

router = APIRouter(prefix="/bloqueios", tags=["bloqueios"])

pode_consultar = [Depends(requer_permissao("bloqueio.consultar"))]
pode_gerenciar = requer_permissao("bloqueio.gerenciar")


def get_bloqueio_or_404(bloqueio_id: int, db: Session) -> BloqueioSecador:
    bloqueio = db.get(BloqueioSecador, bloqueio_id)
    if bloqueio is None:
        log.warning("Bloqueio %s não encontrado", bloqueio_id)
        raise HTTPException(status_code=404, detail="Bloqueio não encontrado")
    return bloqueio


def ensure_secador_existe(secador_id: int, db: Session) -> None:
    # Secador inativo também aceita bloqueio: a parada pode ser o motivo de estar inativo
    if db.get(Secador, secador_id) is None:
        raise HTTPException(status_code=422, detail="Secador inexistente")


@router.get("", response_model=list[BloqueioRead], dependencies=pode_consultar)
def list_bloqueios(
    secador_id: int | None = None,
    # Bloqueios que tocam o período [de, ate]
    de: date | None = None,
    ate: date | None = None,
    db: Session = Depends(get_db),
):
    query = select(BloqueioSecador).options(
        joinedload(BloqueioSecador.secador), joinedload(BloqueioSecador.criado_por)
    )
    if secador_id is not None:
        query = query.where(BloqueioSecador.secador_id == secador_id)
    if de is not None:
        query = query.where(BloqueioSecador.fim >= de)
    if ate is not None:
        query = query.where(BloqueioSecador.inicio <= ate)
    bloqueios = db.scalars(query.order_by(BloqueioSecador.inicio, BloqueioSecador.id)).all()
    log.debug("Listando %s bloqueios", len(bloqueios))
    return bloqueios


@router.post("", response_model=BloqueioRead, status_code=201)
def create_bloqueio(
    data: BloqueioCreate,
    usuario: Usuario = Depends(pode_gerenciar),
    db: Session = Depends(get_db),
):
    ensure_secador_existe(data.secador_id, db)
    bloqueio = BloqueioSecador(**data.model_dump(), criado_por_id=usuario.id)
    db.add(bloqueio)
    db.commit()
    db.refresh(bloqueio)
    log.info("Bloqueio %s criado por %s", bloqueio.id, usuario.id)
    return bloqueio


@router.get("/{bloqueio_id}", response_model=BloqueioRead, dependencies=pode_consultar)
def get_bloqueio(bloqueio_id: int, db: Session = Depends(get_db)):
    return get_bloqueio_or_404(bloqueio_id, db)


@router.patch("/{bloqueio_id}", response_model=BloqueioRead)
def update_bloqueio(
    bloqueio_id: int,
    data: BloqueioUpdate,
    usuario: Usuario = Depends(pode_gerenciar),
    db: Session = Depends(get_db),
):
    bloqueio = get_bloqueio_or_404(bloqueio_id, db)
    campos = data.model_dump(exclude_unset=True)
    if "secador_id" in campos:
        ensure_secador_existe(campos["secador_id"], db)
    # O período só pode ser validado depois de juntar o que veio com o que já existe
    if campos.get("fim", bloqueio.fim) < campos.get("inicio", bloqueio.inicio):
        raise HTTPException(status_code=422, detail="fim não pode ser anterior ao início")
    for campo, valor in campos.items():
        setattr(bloqueio, campo, valor)
    db.commit()
    db.refresh(bloqueio)
    log.info("Bloqueio %s atualizado por %s", bloqueio.id, usuario.id)
    return bloqueio


@router.delete("/{bloqueio_id}", status_code=204)
def delete_bloqueio(
    bloqueio_id: int,
    usuario: Usuario = Depends(pode_gerenciar),
    db: Session = Depends(get_db),
):
    bloqueio = get_bloqueio_or_404(bloqueio_id, db)
    db.delete(bloqueio)
    db.commit()
    log.info("Bloqueio %s removido por %s", bloqueio_id, usuario.id)
