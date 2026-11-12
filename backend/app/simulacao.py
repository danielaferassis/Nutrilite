"""Monta a entrada do motor a partir do banco.

Regras de recorte do horizonte [inicio, fim]:
- Ervas e secadores: só os ativos. Capacidade entra só se a erva e o secador
  estão ativos (secador inativo não pode receber erva).
- Demandas: prazo a partir do `inicio` (antes disso já passou). As que vencem
  depois do `fim` também entram: recebem a secagem do horizonte, mas não geram
  ATRASO neste plano (o motor separa o que falta delas no KPI
  `a_cobrir_apos_horizonte_kg`).
- Lotes: chegada até o `fim` e que ainda podem estar esperando no `inicio`
  (chegada a partir de `inicio - maior espera cadastrada`). O motor descarta o
  que já tiver vencido.
- Recebido substitui previsto: previsão com recebimento sai da entrada, e cada
  recebimento entra como lote com data e kg reais (id "R<n>"). Chegada não
  prevista também entra.

- Bloqueios: os que tocam o horizonte, de secadores ativos.

Demanda ou lote de erva inativa continua na entrada: o motor gera
PARAM_AUSENTE ("erva não cadastrada") em vez de o plano ignorá-los calado.
"""

import logging
from dataclasses import asdict
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.cadastro import (
    para_bloqueio,
    para_capacidade,
    para_demanda,
    para_erva,
    para_lote,
    para_lote_recebido,
    para_rendimento,
    para_secador,
)
from app.models import (
    BloqueioSecador,
    Capacidade,
    Demanda,
    Erva,
    PrevisaoOferta,
    Recebimento,
    Rendimento,
    Secador,
)
from app.planner import simular
from app.planner.types import EntradaPlanejamento, ResultadoPlano

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
        .where(Demanda.prazo >= inicio)
        .order_by(Demanda.id)
    ).all()

    # Espera ausente não amplia a janela: o motor já gera PARAM_AUSENTE para ela
    maior_espera = db.scalar(select(func.max(Erva.espera_maxima_dias))) or 0
    primeira_chegada = inicio - timedelta(days=maior_espera)
    lotes = db.scalars(
        select(PrevisaoOferta)
        .options(joinedload(PrevisaoOferta.erva))
        .where(
            PrevisaoOferta.data_chegada >= primeira_chegada,
            PrevisaoOferta.data_chegada <= fim,
            ~PrevisaoOferta.recebimentos.any(),
        )
        .order_by(PrevisaoOferta.id)
    ).all()
    recebimentos = db.scalars(
        select(Recebimento)
        .options(joinedload(Recebimento.erva))
        .where(
            Recebimento.data_recebimento >= primeira_chegada,
            Recebimento.data_recebimento <= fim,
        )
        .order_by(Recebimento.id)
    ).all()

    bloqueios = db.scalars(
        select(BloqueioSecador)
        .join(BloqueioSecador.secador)
        .options(joinedload(BloqueioSecador.secador))
        .where(
            Secador.ativo.is_(True),
            BloqueioSecador.inicio <= fim,
            BloqueioSecador.fim >= inicio,
        )
        .order_by(BloqueioSecador.inicio, BloqueioSecador.id)
    ).all()

    log.debug(
        "Entrada %s a %s: %s demandas, %s lotes previstos, %s recebidos, %s capacidades",
        inicio, fim, len(demandas), len(lotes), len(recebimentos), len(capacidades),
    )
    return EntradaPlanejamento(
        inicio=inicio,
        fim=fim,
        ervas=[para_erva(e) for e in ervas],
        secadores=[para_secador(s) for s in secadores],
        capacidades=[para_capacidade(c) for c in capacidades],
        rendimentos=[para_rendimento(r) for r in rendimentos],
        lotes=[para_lote(p) for p in lotes] + [para_lote_recebido(r) for r in recebimentos],
        demandas=[para_demanda(d) for d in demandas],
        bloqueios=[para_bloqueio(b) for b in bloqueios],
        dias_operacao=dias_operacao,
    )


def executar(
    db: Session, inicio: date, fim: date, dias_operacao: frozenset[int] | None
) -> tuple[EntradaPlanejamento, ResultadoPlano, list[str]]:
    """Monta a entrada, roda o motor e devolve também os avisos da simulação.

    Avisos são limitações que não viram pendência do motor. Hoje não há
    nenhuma; a lista fica para as próximas (ex.: calendário ainda no pedido).
    """
    entrada = montar_entrada(db, inicio, fim, dias_operacao)
    resultado = simular(entrada)
    return entrada, resultado, []


def para_json(valor):
    """Converte dataclasses do motor em JSON (datas ISO, conjuntos ordenados)."""
    if hasattr(valor, "__dataclass_fields__"):
        return para_json(asdict(valor))
    if isinstance(valor, dict):
        return {chave: para_json(v) for chave, v in valor.items()}
    if isinstance(valor, (list, tuple)):
        return [para_json(v) for v in valor]
    if isinstance(valor, (set, frozenset)):
        return sorted(para_json(v) for v in valor)
    if isinstance(valor, date):
        return valor.isoformat()
    return valor
