from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Funcionalidade
from app.schemas import FuncionalidadeRead

# Somente leitura: as funcionalidades são definidas pelo código (cada uma protege
# um endpoint/tela), então são cadastradas por migration, não pela API.
router = APIRouter(prefix="/funcionalidades", tags=["funcionalidades"])


@router.get("", response_model=list[FuncionalidadeRead])
def list_funcionalidades(db: Session = Depends(get_db)):
    return db.scalars(
        select(Funcionalidade).order_by(Funcionalidade.modulo, Funcionalidade.nome)
    ).all()
