"""Listagem do cadastro da secagem para os selects das telas.

Só leitura e só exige login: a Fonte fornecedora também escolhe a erva da
previsão. Cadastrar e alterar erva, secador, capacidade e rendimento ainda
não tem endpoint (hoje é feito direto no banco).
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.acesso import get_usuario_atual
from app.database import get_db
from app.models import Capacidade, Erva, Secador
from app.schemas import CapacidadeRead, ErvaRead, SecadorRead

router = APIRouter(tags=["cadastros"], dependencies=[Depends(get_usuario_atual)])


@router.get("/ervas", response_model=list[ErvaRead])
def list_ervas(ativos: bool = True, db: Session = Depends(get_db)):
    query = select(Erva).order_by(Erva.nome)
    if ativos:
        query = query.where(Erva.ativo.is_(True))
    return db.scalars(query).all()


@router.get("/secadores", response_model=list[SecadorRead])
def list_secadores(ativos: bool = True, db: Session = Depends(get_db)):
    query = select(Secador).order_by(Secador.codigo)
    if ativos:
        query = query.where(Secador.ativo.is_(True))
    return db.scalars(query).all()


@router.get("/capacidades", response_model=list[CapacidadeRead])
def list_capacidades(db: Session = Depends(get_db)):
    # Campos nulos vão como null: a tela mostra "não informado", nunca zero
    return db.scalars(select(Capacidade).order_by(Capacidade.erva_id, Capacidade.secador_id)).all()
