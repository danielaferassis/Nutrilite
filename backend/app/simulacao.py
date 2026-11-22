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
- Lote que chegou antes do `inicio` entra só com o saldo: sai dele o que o
  plano aprovado que vale em cada dia (app/vigencia.py) já destinou a secar
  nos dias antes do `inicio`. Sem isso, em dois planos seguidos o mesmo kg
  viraria oferta duas vezes. Premissa: o plano aprovado foi cumprido; os
  apontamentos do Infinity não dizem de qual lote veio a carga. Recebimento
  de uma previsão herda o que o plano destinou à previsão. Lote sem saldo
  sai da entrada.

- Bloqueios: os que tocam o horizonte, de secadores ativos.

Demanda ou lote de erva inativa continua na entrada: o motor gera
PARAM_AUSENTE ("erva não cadastrada") em vez de o plano ignorá-los calado.
"""

import logging
from collections import defaultdict
from dataclasses import asdict, replace
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
    Plano,
    PlanoAlocacao,
    PrevisaoOferta,
    Recebimento,
    Rendimento,
    Secador,
    StatusPlano,
)
from app.planner import simular
from app.planner.types import EntradaPlanejamento, LotePrevisto, ResultadoPlano, TipoPendencia
from app.vigencia import vigente_por_dia

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
    lotes_motor = _descontar_ja_planejado(
        db,
        primeira_chegada,
        inicio,
        [para_lote(p) for p in lotes],
        [(para_lote_recebido(r), r.previsao_id) for r in recebimentos],
    )
    return EntradaPlanejamento(
        inicio=inicio,
        fim=fim,
        ervas=[para_erva(e) for e in ervas],
        secadores=[para_secador(s) for s in secadores],
        capacidades=[para_capacidade(c) for c in capacidades],
        rendimentos=[para_rendimento(r) for r in rendimentos],
        lotes=lotes_motor,
        demandas=[para_demanda(d) for d in demandas],
        bloqueios=[para_bloqueio(b) for b in bloqueios],
        dias_operacao=dias_operacao,
    )


def _descontar_ja_planejado(
    db: Session,
    de: date,
    inicio: date,
    previstos: list[LotePrevisto],
    recebidos: list[tuple[LotePrevisto, int | None]],
) -> list[LotePrevisto]:
    """Tira de cada lote o kg que o plano aprovado vigente já secava antes do `inicio`."""
    if de >= inicio:
        return previstos + [lote for lote, _ in recebidos]
    ontem = inicio - timedelta(days=1)
    planos = db.scalars(
        select(Plano).where(
            Plano.status == StatusPlano.APROVADO, Plano.inicio <= ontem, Plano.fim >= de
        )
    ).all()
    vigentes = vigente_por_dia(planos, de, ontem)
    planejado: dict[str, float] = defaultdict(float)  # lote_id do plano → kg
    if vigentes:
        for alocacao in db.scalars(
            select(PlanoAlocacao).where(
                PlanoAlocacao.plano_id.in_({p.id for p in vigentes.values()}),
                PlanoAlocacao.dia >= de,
                PlanoAlocacao.dia <= ontem,
            )
        ):
            if vigentes.get(alocacao.dia) is not None and vigentes[alocacao.dia].id == alocacao.plano_id:
                planejado[alocacao.lote_id] += float(alocacao.kg_fresco)
    if not planejado:
        return previstos + [lote for lote, _ in recebidos]

    resultado: list[LotePrevisto] = []

    def abater(lote: LotePrevisto, chave: str) -> None:
        descontado = min(lote.kg_fresco, planejado.get(chave, 0.0))
        planejado[chave] = planejado.get(chave, 0.0) - descontado
        saldo = round(lote.kg_fresco - descontado, 3)
        if descontado:
            log.info("Lote %s: %.3f kg já estavam no plano aprovado antes de %s", lote.id, descontado, inicio)
        if saldo > 0:
            resultado.append(replace(lote, kg_fresco=saldo) if descontado else lote)

    for lote in previstos:
        abater(lote, lote.id)
    for lote, previsao_id in recebidos:
        abater(lote, lote.id)  # plano feito depois do recebimento
        if previsao_id is not None and resultado and resultado[-1].id == lote.id:
            # plano feito antes do recebimento: as alocações apontam para a previsão
            ultimo = resultado.pop()
            abater(ultimo, str(previsao_id))
    return resultado


def executar(
    db: Session, inicio: date, fim: date, dias_operacao: frozenset[int] | None
) -> tuple[EntradaPlanejamento, ResultadoPlano, list[str]]:
    """Monta a entrada, roda o motor e devolve também os avisos da simulação.

    Avisos são limitações que não viram pendência do motor (ex.: plano parcial
    porque alguma erva ficou de fora por parâmetro ausente).
    """
    entrada = montar_entrada(db, inicio, fim, dias_operacao)
    resultado = simular(entrada)
    return entrada, resultado, avisos_do_resultado(resultado)


def avisos_do_resultado(resultado: ResultadoPlano) -> list[str]:
    ausentes = sorted(
        {p.erva for p in resultado.pendencias if p.tipo == TipoPendencia.PARAM_AUSENTE and p.erva}
    )
    if not ausentes or not (resultado.alocacoes or resultado.necessidades):
        return []
    if len(ausentes) == 1:
        quem = f"{ausentes[0]} ficou fora da simulação"
        com = "Com essa erva"
    else:
        quem = f"{', '.join(ausentes[:-1])} e {ausentes[-1]} ficaram fora da simulação"
        com = "Com essas ervas"
    return [
        f"Plano parcial: {quem} por cadastro incompleto. {com}, os secadores teriam menos "
        "horas livres para as demais. Complete o cadastro e simule de novo para poder aprovar."
    ]


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
