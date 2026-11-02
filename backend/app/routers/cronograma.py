"""Cronograma: o que os planos aprovados mandam secar e o que de fato chegou.

Junta, para um período:
- a linha do tempo dos planos aprovados e substituídos;
- as alocações dos planos aprovados (vigentes);
- as chegadas previstas com a situação de cada uma e o desvio do recebido.
"""

import logging
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app import calendario
from app.acesso import requer_alguma_permissao
from app.database import get_db
from app.models import Plano, PlanoAlocacao, PrevisaoOferta, Recebimento, StatusPlano
from app.schemas import (
    HORIZONTE_MAXIMO_DIAS,
    AlocacaoCronograma,
    ChegadaCronograma,
    CronogramaRead,
)

log = logging.getLogger(__name__)

router = APIRouter(
    prefix="/cronograma",
    tags=["cronograma"],
    dependencies=[
        Depends(
            requer_alguma_permissao(
                "plano.consultar", "plano.simular", "plano.aprovar",
                "recebimento.consultar", "recebimento.registrar",
            )
        )
    ],
)


def _situacao(previsao: PrevisaoOferta, hoje: date) -> str:
    if previsao.recebimentos:
        return "recebida"
    return "atrasada" if previsao.data_chegada < hoje else "aguardando"


def _alocacao(alocacao: PlanoAlocacao, versao: int) -> AlocacaoCronograma:
    campos = {c: getattr(alocacao, c) for c in AlocacaoCronograma.model_fields if c != "versao"}
    return AlocacaoCronograma(**campos, versao=versao)


def _chegada_prevista(previsao: PrevisaoOferta, hoje: date) -> ChegadaCronograma:
    recebido = sum((r.kg_fresco for r in previsao.recebimentos), Decimal(0))
    return ChegadaCronograma(
        previsao_id=previsao.id,
        erva=previsao.erva,
        origem=previsao.origem,
        data_prevista=previsao.data_chegada,
        kg_previsto=previsao.kg_fresco,
        recebimentos=previsao.recebimentos,
        kg_recebido=recebido,
        desvio_kg=recebido - previsao.kg_fresco if previsao.recebimentos else None,
        situacao=_situacao(previsao, hoje),
    )


def _chegada_nao_prevista(recebimento: Recebimento) -> ChegadaCronograma:
    return ChegadaCronograma(
        previsao_id=None,
        erva=recebimento.erva,
        origem=recebimento.origem,
        data_prevista=None,
        kg_previsto=None,
        recebimentos=[recebimento],
        kg_recebido=recebimento.kg_fresco,
        desvio_kg=None,
        situacao="nao_prevista",
    )


@router.get("", response_model=CronogramaRead)
def get_cronograma(de: date, ate: date, db: Session = Depends(get_db)):
    if ate < de:
        raise HTTPException(status_code=422, detail="ate não pode ser anterior a de")
    if (ate - de).days + 1 > HORIZONTE_MAXIMO_DIAS:
        raise HTTPException(
            status_code=422, detail=f"período máximo de {HORIZONTE_MAXIMO_DIAS} dias"
        )
    hoje = calendario.hoje()

    planos = db.scalars(
        select(Plano)
        .options(joinedload(Plano.criado_por), joinedload(Plano.aprovado_por))
        .where(
            Plano.status.in_([StatusPlano.APROVADO, StatusPlano.SUBSTITUIDO]),
            Plano.inicio <= ate,
            Plano.fim >= de,
        )
        .order_by(Plano.aprovado_em, Plano.id)
    ).all()
    versoes = {p.id: p.versao for p in planos}

    alocacoes = db.scalars(
        select(PlanoAlocacao)
        .join(Plano)
        .where(
            Plano.status == StatusPlano.APROVADO,
            PlanoAlocacao.dia >= de,
            PlanoAlocacao.dia <= ate,
        )
        .order_by(PlanoAlocacao.dia, PlanoAlocacao.secador, PlanoAlocacao.id)
    ).all()

    # Previsões do período, e as de fora dele que foram recebidas dentro dele
    recebida_no_periodo = PrevisaoOferta.recebimentos.any(
        (Recebimento.data_recebimento >= de) & (Recebimento.data_recebimento <= ate)
    )
    previsoes = db.scalars(
        select(PrevisaoOferta)
        .options(
            joinedload(PrevisaoOferta.erva),
            selectinload(PrevisaoOferta.recebimentos).joinedload(Recebimento.erva),
            selectinload(PrevisaoOferta.recebimentos).joinedload(Recebimento.registrado_por),
        )
        .where(
            or_(
                (PrevisaoOferta.data_chegada >= de) & (PrevisaoOferta.data_chegada <= ate),
                recebida_no_periodo,
            )
        )
        .order_by(PrevisaoOferta.data_chegada, PrevisaoOferta.id)
    ).all()
    nao_previstas = db.scalars(
        select(Recebimento)
        .options(joinedload(Recebimento.erva), joinedload(Recebimento.registrado_por))
        .where(
            Recebimento.previsao_id.is_(None),
            Recebimento.data_recebimento >= de,
            Recebimento.data_recebimento <= ate,
        )
        .order_by(Recebimento.data_recebimento, Recebimento.id)
    ).all()

    log.debug(
        "Cronograma %s a %s: %s planos, %s alocações, %s previsões, %s não previstas",
        de, ate, len(planos), len(alocacoes), len(previsoes), len(nao_previstas),
    )
    return CronogramaRead(
        de=de,
        ate=ate,
        hoje=hoje,
        planos=planos,
        alocacoes=[_alocacao(a, versoes[a.plano_id]) for a in alocacoes],
        chegadas=[_chegada_prevista(p, hoje) for p in previsoes]
        + [_chegada_nao_prevista(r) for r in nao_previstas],
    )
