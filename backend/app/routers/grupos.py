import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Funcionalidade, Grupo
from app.schemas import GrupoCreate, GrupoRead, GrupoUpdate

log = logging.getLogger(__name__)

router = APIRouter(prefix="/grupos", tags=["grupos"])


def get_grupo_or_404(grupo_id: int, db: Session) -> Grupo:
    grupo = db.get(Grupo, grupo_id)
    if grupo is None:
        log.warning("Grupo %s não encontrado", grupo_id)
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    return grupo


def ensure_nome_disponivel(nome: str, db: Session, ignorar_id: int | None = None) -> None:
    existente = db.scalar(select(Grupo.id).where(Grupo.nome == nome))
    if existente is not None and existente != ignorar_id:
        raise HTTPException(status_code=409, detail="Já existe um grupo com esse nome")


def load_funcionalidades(ids: list[int], db: Session) -> list[Funcionalidade]:
    ids = set(ids)
    funcionalidades = db.scalars(select(Funcionalidade).where(Funcionalidade.id.in_(ids))).all()
    faltando = ids - {f.id for f in funcionalidades}
    if faltando:
        raise HTTPException(
            status_code=422, detail=f"Funcionalidades inexistentes: {sorted(faltando)}"
        )
    return list(funcionalidades)


@router.get("", response_model=list[GrupoRead])
def list_grupos(db: Session = Depends(get_db)):
    grupos = db.scalars(
        select(Grupo).options(selectinload(Grupo.funcionalidades)).order_by(Grupo.nome)
    ).all()
    log.debug("Listando %s grupos", len(grupos))
    return grupos


@router.post("", response_model=GrupoRead, status_code=201)
def create_grupo(data: GrupoCreate, db: Session = Depends(get_db)):
    ensure_nome_disponivel(data.nome, db)
    grupo = Grupo(**data.model_dump(exclude={"funcionalidade_ids"}))
    grupo.funcionalidades = load_funcionalidades(data.funcionalidade_ids, db)
    db.add(grupo)
    db.commit()
    db.refresh(grupo)
    log.info("Grupo %s criado", grupo.id)
    return grupo


@router.get("/{grupo_id}", response_model=GrupoRead)
def get_grupo(grupo_id: int, db: Session = Depends(get_db)):
    return get_grupo_or_404(grupo_id, db)


@router.patch("/{grupo_id}", response_model=GrupoRead)
def update_grupo(grupo_id: int, data: GrupoUpdate, db: Session = Depends(get_db)):
    grupo = get_grupo_or_404(grupo_id, db)
    campos = data.model_dump(exclude_unset=True, exclude={"funcionalidade_ids"})
    if "nome" in campos:
        ensure_nome_disponivel(campos["nome"], db, ignorar_id=grupo.id)
    for campo, valor in campos.items():
        setattr(grupo, campo, valor)
    if data.funcionalidade_ids is not None:
        grupo.funcionalidades = load_funcionalidades(data.funcionalidade_ids, db)
    db.commit()
    db.refresh(grupo)
    log.info("Grupo %s atualizado", grupo.id)
    return grupo


@router.delete("/{grupo_id}", status_code=204)
def delete_grupo(grupo_id: int, db: Session = Depends(get_db)):
    grupo = get_grupo_or_404(grupo_id, db)
    db.delete(grupo)
    db.commit()
    log.info("Grupo %s removido", grupo_id)
