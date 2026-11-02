"""Recebimentos: a erva fresca que chegou de fato.

Recebimento ligado a uma previsão substitui o previsto nas simulações
seguintes (data e kg reais). Por isso a previsão recebida fica travada:
não pode mais ser alterada nem removida.
"""

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app import calendario
from app.acesso import requer_alguma_permissao, requer_permissao
from app.database import get_db
from app.models import PrevisaoOferta, Recebimento, Usuario
from app.routers.demandas import ensure_erva_ativa
from app.schemas import RecebimentoCreate, RecebimentoRead, RecebimentoUpdate

log = logging.getLogger(__name__)

router = APIRouter(prefix="/recebimentos", tags=["recebimentos"])

pode_consultar = [
    Depends(requer_alguma_permissao("recebimento.consultar", "recebimento.registrar"))
]
pode_registrar = requer_permissao("recebimento.registrar")


def get_recebimento_or_404(recebimento_id: int, db: Session) -> Recebimento:
    recebimento = db.get(Recebimento, recebimento_id)
    if recebimento is None:
        log.warning("Recebimento %s não encontrado", recebimento_id)
        raise HTTPException(status_code=404, detail="Recebimento não encontrado")
    return recebimento


def ensure_nao_futuro(dia: date) -> None:
    if dia > calendario.hoje():
        raise HTTPException(status_code=422, detail="Recebimento não pode ter data futura")


@router.get("", response_model=list[RecebimentoRead], dependencies=pode_consultar)
def list_recebimentos(
    de: date | None = None,
    ate: date | None = None,
    erva_id: int | None = None,
    previsao_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = select(Recebimento).options(
        joinedload(Recebimento.erva), joinedload(Recebimento.registrado_por)
    )
    if de is not None:
        query = query.where(Recebimento.data_recebimento >= de)
    if ate is not None:
        query = query.where(Recebimento.data_recebimento <= ate)
    if erva_id is not None:
        query = query.where(Recebimento.erva_id == erva_id)
    if previsao_id is not None:
        query = query.where(Recebimento.previsao_id == previsao_id)
    recebimentos = db.scalars(
        query.order_by(Recebimento.data_recebimento.desc(), Recebimento.id.desc())
    ).all()
    log.debug("Listando %s recebimentos", len(recebimentos))
    return recebimentos


@router.post("", response_model=RecebimentoRead, status_code=201)
def create_recebimento(
    data: RecebimentoCreate,
    usuario: Usuario = Depends(pode_registrar),
    db: Session = Depends(get_db),
):
    ensure_nao_futuro(data.data_recebimento)
    campos = data.model_dump()
    if data.previsao_id is not None:
        previsao = db.get(PrevisaoOferta, data.previsao_id)
        if previsao is None:
            raise HTTPException(status_code=422, detail="Previsão inexistente")
        campos.update(erva_id=previsao.erva_id, origem=previsao.origem)
    else:
        ensure_erva_ativa(data.erva_id, db)
    recebimento = Recebimento(**campos, registrado_por_id=usuario.id)
    db.add(recebimento)
    db.commit()
    db.refresh(recebimento)
    log.info(
        "Recebimento %s (previsão %s, %s kg) registrado por %s",
        recebimento.id, recebimento.previsao_id, recebimento.kg_fresco, usuario.id,
    )
    return recebimento


@router.get("/{recebimento_id}", response_model=RecebimentoRead, dependencies=pode_consultar)
def get_recebimento(recebimento_id: int, db: Session = Depends(get_db)):
    return get_recebimento_or_404(recebimento_id, db)


@router.patch("/{recebimento_id}", response_model=RecebimentoRead)
def update_recebimento(
    recebimento_id: int,
    data: RecebimentoUpdate,
    usuario: Usuario = Depends(pode_registrar),
    db: Session = Depends(get_db),
):
    recebimento = get_recebimento_or_404(recebimento_id, db)
    campos = data.model_dump(exclude_unset=True)
    if "data_recebimento" in campos:
        ensure_nao_futuro(campos["data_recebimento"])
    for campo, valor in campos.items():
        setattr(recebimento, campo, valor)
    db.commit()
    db.refresh(recebimento)
    log.info("Recebimento %s corrigido por %s", recebimento.id, usuario.id)
    return recebimento


@router.delete("/{recebimento_id}", status_code=204)
def delete_recebimento(
    recebimento_id: int,
    usuario: Usuario = Depends(pode_registrar),
    db: Session = Depends(get_db),
):
    recebimento = get_recebimento_or_404(recebimento_id, db)
    db.delete(recebimento)
    db.commit()
    log.info("Recebimento %s removido por %s", recebimento_id, usuario.id)
