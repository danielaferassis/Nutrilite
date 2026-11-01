import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.acesso import requer_permissao
from app.database import get_db
from app.models import Demanda, Erva, Usuario
from app.schemas import DemandaCreate, DemandaRead, DemandaUpdate

log = logging.getLogger(__name__)

router = APIRouter(prefix="/demandas", tags=["demandas"])

pode_consultar = [Depends(requer_permissao("demanda.consultar"))]
pode_gerenciar = requer_permissao("demanda.gerenciar")


def get_demanda_or_404(demanda_id: int, db: Session) -> Demanda:
    demanda = db.get(Demanda, demanda_id)
    if demanda is None:
        log.warning("Demanda %s não encontrada", demanda_id)
        raise HTTPException(status_code=404, detail="Demanda não encontrada")
    return demanda


def ensure_erva_ativa(erva_id: int, db: Session) -> None:
    erva = db.get(Erva, erva_id)
    if erva is None or not erva.ativo:
        raise HTTPException(status_code=422, detail="Erva inexistente ou inativa")


@router.get("", response_model=list[DemandaRead], dependencies=pode_consultar)
def list_demandas(
    erva_id: int | None = None,
    prazo_de: date | None = None,
    prazo_ate: date | None = None,
    db: Session = Depends(get_db),
):
    query = select(Demanda).options(joinedload(Demanda.erva), joinedload(Demanda.criado_por))
    if erva_id is not None:
        query = query.where(Demanda.erva_id == erva_id)
    if prazo_de is not None:
        query = query.where(Demanda.prazo >= prazo_de)
    if prazo_ate is not None:
        query = query.where(Demanda.prazo <= prazo_ate)
    # Mesma ordem em que o motor atende: prazo mais próximo, depois maior prioridade
    demandas = db.scalars(
        query.order_by(Demanda.prazo, Demanda.prioridade.desc(), Demanda.id)
    ).all()
    log.debug("Listando %s demandas", len(demandas))
    return demandas


@router.post("", response_model=DemandaRead, status_code=201)
def create_demanda(
    data: DemandaCreate,
    usuario: Usuario = Depends(pode_gerenciar),
    db: Session = Depends(get_db),
):
    ensure_erva_ativa(data.erva_id, db)
    demanda = Demanda(**data.model_dump(), criado_por_id=usuario.id)
    db.add(demanda)
    db.commit()
    db.refresh(demanda)
    log.info("Demanda %s criada por %s", demanda.id, usuario.id)
    return demanda


@router.get("/{demanda_id}", response_model=DemandaRead, dependencies=pode_consultar)
def get_demanda(demanda_id: int, db: Session = Depends(get_db)):
    return get_demanda_or_404(demanda_id, db)


@router.patch("/{demanda_id}", response_model=DemandaRead)
def update_demanda(
    demanda_id: int,
    data: DemandaUpdate,
    usuario: Usuario = Depends(pode_gerenciar),
    db: Session = Depends(get_db),
):
    demanda = get_demanda_or_404(demanda_id, db)
    campos = data.model_dump(exclude_unset=True)
    if "erva_id" in campos:
        ensure_erva_ativa(campos["erva_id"], db)
    for campo, valor in campos.items():
        setattr(demanda, campo, valor)
    db.commit()
    db.refresh(demanda)
    log.info("Demanda %s atualizada por %s", demanda.id, usuario.id)
    return demanda


@router.delete("/{demanda_id}", status_code=204)
def delete_demanda(
    demanda_id: int,
    usuario: Usuario = Depends(pode_gerenciar),
    db: Session = Depends(get_db),
):
    demanda = get_demanda_or_404(demanda_id, db)
    db.delete(demanda)
    db.commit()
    log.info("Demanda %s removida por %s", demanda_id, usuario.id)
