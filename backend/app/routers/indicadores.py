"""Indicadores da secagem: OEE e aderência ao plano (regras em app/indicadores.py)."""

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import indicadores
from app.acesso import requer_alguma_permissao
from app.database import get_db
from app.models import Secador
from app.schemas import HORIZONTE_MAXIMO_DIAS, IndicadoresSecagemRead

log = logging.getLogger(__name__)

router = APIRouter(
    prefix="/indicadores",
    tags=["indicadores"],
    dependencies=[
        Depends(
            requer_alguma_permissao(
                "plano.consultar", "plano.simular", "plano.aprovar", "relatorio.importacao"
            )
        )
    ],
)


@router.get("/secagem", response_model=IndicadoresSecagemRead)
def get_indicadores_secagem(de: date, ate: date, db: Session = Depends(get_db)):
    if ate < de:
        raise HTTPException(status_code=422, detail="ate não pode ser anterior a de")
    if (ate - de).days + 1 > HORIZONTE_MAXIMO_DIAS:
        raise HTTPException(status_code=422, detail=f"período máximo de {HORIZONTE_MAXIMO_DIAS} dias")

    secadores = db.scalars(select(Secador).where(Secador.ativo.is_(True))).all()
    resultado = indicadores.calcular(db, de, ate, secadores)
    por_secador, dias, total = indicadores.resumo(resultado, secadores)
    log.debug("Indicadores de %s a %s: %d secadores, %d dias", de, ate, len(por_secador), len(dias))
    return IndicadoresSecagemRead(
        de=de, ate=ate, total=total, secadores=por_secador, dias=dias, avisos=resultado.avisos
    )
