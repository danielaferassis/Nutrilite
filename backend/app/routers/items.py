import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.acesso import get_usuario_atual
from app.database import get_db
from app.models import Item
from app.schemas import ItemCreate, ItemRead

log = logging.getLogger(__name__)

# Basta estar logado; para restringir mais, troque por requer_permissao("...")
router = APIRouter(prefix="/items", tags=["items"], dependencies=[Depends(get_usuario_atual)])


def get_item_or_404(item_id: int, db: Session) -> Item:
    item = db.get(Item, item_id)
    if item is None:
        log.warning("Item %s não encontrado", item_id)
        raise HTTPException(status_code=404, detail="Item não encontrado")
    return item


@router.get("", response_model=list[ItemRead])
def list_items(db: Session = Depends(get_db)):
    items = db.scalars(select(Item).order_by(Item.id)).all()
    log.debug("Listando %s itens", len(items))
    return items


@router.post("", response_model=ItemRead, status_code=201)
def create_item(data: ItemCreate, db: Session = Depends(get_db)):
    item = Item(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    log.info("Item %s criado", item.id)
    return item


@router.get("/{item_id}", response_model=ItemRead)
def get_item(item_id: int, db: Session = Depends(get_db)):
    return get_item_or_404(item_id, db)


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = get_item_or_404(item_id, db)
    db.delete(item)
    db.commit()
    log.info("Item %s removido", item_id)
