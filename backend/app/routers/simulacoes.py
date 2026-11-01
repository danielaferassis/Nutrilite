"""Simulação do plano de secagem. Não grava nada: salvar e aprovar é outra etapa."""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.acesso import requer_permissao
from app.database import get_db
from app.models import Usuario
from app.schemas import SimulacaoRead, SimulacaoRequest
from app.simulacao import executar

log = logging.getLogger(__name__)

router = APIRouter(prefix="/simulacoes", tags=["simulacoes"])

pode_simular = requer_permissao("plano.simular")


@router.post("", response_model=SimulacaoRead)
def create_simulacao(
    data: SimulacaoRequest,
    usuario: Usuario = Depends(pode_simular),
    db: Session = Depends(get_db),
):
    dias = None if data.dias_operacao is None else frozenset(data.dias_operacao)
    _, resultado, avisos = executar(db, data.inicio, data.fim, dias)
    log.info(
        "Simulação %s a %s por %s: %s alocações, %s pendências",
        data.inicio, data.fim, usuario.id, len(resultado.alocacoes), len(resultado.pendencias),
    )
    return SimulacaoRead(
        inicio=data.inicio,
        fim=data.fim,
        dias_operacao=None if dias is None else sorted(dias),
        viavel=resultado.viavel,
        necessidades=resultado.necessidades,
        alocacoes=resultado.alocacoes,
        pendencias=resultado.pendencias,
        kpis=resultado.kpis,
        avisos=avisos,
    )
