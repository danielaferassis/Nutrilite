"""Monta a entrada do motor a partir do banco.

Regras de recorte do horizonte [inicio, fim]:
- Ervas e secadores: só os ativos. Capacidade entra só se a erva e o secador
  estão ativos (secador inativo não pode receber erva).
- Demandas: só as com prazo dentro do horizonte. Prazo depois do `fim` não é
  atraso deste plano; prazo antes do `inicio` já passou.
- Lotes: chegada até o `fim` e que ainda podem estar esperando no `inicio`
  (chegada a partir de `inicio - maior espera cadastrada`). O motor descarta o
  que já tiver vencido.

Demanda ou lote de erva inativa continua na entrada: o motor gera
PARAM_AUSENTE ("erva não cadastrada") em vez de o plano ignorá-los calado.
Bloqueios de secador ainda não têm tabela: a lista vai vazia.
"""

import logging
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.cadastro import (
    para_capacidade,
    para_demanda,
    para_erva,
    para_lote,
    para_rendimento,
    para_secador,
)
from app.models import Capacidade, Demanda, Erva, PrevisaoOferta, Rendimento, Secador
from app.planner.types import EntradaPlanejamento

log = logging.getLogger(__name__)


def montar_entrada(
    db: Session, inicio: date, fim: date, dias_operacao: frozenset[int] | None
) -> EntradaPlanejamento:
    ervas = db.scalars(select(Erva).where(Erva.ativo.is_(True))).all()
    secadores = db.scalars(select(Secador).where(Secador.ativo.is_(True))).all()
    capacidades = db.scalars(
        select(Capacidade)
        .join(Capacidade.erva)
        .join(Capacidade.secador)
        .options(joinedload(Capacidade.erva), joinedload(Capacidade.secador))
        .where(Erva.ativo.is_(True), Secador.ativo.is_(True))
    ).all()
    rendimentos = db.scalars(
        select(Rendimento)
        .join(Rendimento.erva)
        .options(joinedload(Rendimento.erva))
        .where(Erva.ativo.is_(True))
    ).all()
    demandas = db.scalars(
        select(Demanda)
        .options(joinedload(Demanda.erva))
        .where(Demanda.prazo >= inicio, Demanda.prazo <= fim)
        .order_by(Demanda.id)
    ).all()

    # Espera ausente não amplia a janela: o motor já gera PARAM_AUSENTE para ela
    maior_espera = db.scalar(select(func.max(Erva.espera_maxima_dias))) or 0
    lotes = db.scalars(
        select(PrevisaoOferta)
        .options(joinedload(PrevisaoOferta.erva))
        .where(
            PrevisaoOferta.data_chegada >= inicio - timedelta(days=maior_espera),
            PrevisaoOferta.data_chegada <= fim,
        )
        .order_by(PrevisaoOferta.id)
    ).all()

    log.debug(
        "Entrada %s a %s: %s demandas, %s lotes, %s capacidades",
        inicio, fim, len(demandas), len(lotes), len(capacidades),
    )
    return EntradaPlanejamento(
        inicio=inicio,
        fim=fim,
        ervas=[para_erva(e) for e in ervas],
        secadores=[para_secador(s) for s in secadores],
        capacidades=[para_capacidade(c) for c in capacidades],
        rendimentos=[para_rendimento(r) for r in rendimentos],
        lotes=[para_lote(p) for p in lotes],
        demandas=[para_demanda(d) for d in demandas],
        bloqueios=[],
        dias_operacao=dias_operacao,
    )
