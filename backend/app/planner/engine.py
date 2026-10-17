"""Ponto de entrada do motor de planejamento.

Fluxo de `simular()`:
1. Validar parâmetros (validation.py). Faltou algo → PARAM_AUSENTE e para.
2. Converter demandas em necessidade de erva fresca (conversion.py).
3. Alocar lotes nos secadores dia a dia (TODO, ver `_alocar`).
4. Calcular KPIs (TODO).
"""

from __future__ import annotations

import logging

from app.planner.conversion import ParametroAusenteError, necessidade_fresca
from app.planner.types import (
    EntradaPlanejamento,
    Pendencia,
    ResultadoPlano,
    TipoPendencia,
)
from app.planner.validation import validar_entrada

log = logging.getLogger(__name__)


def simular(entrada: EntradaPlanejamento) -> ResultadoPlano:
    """Gera uma proposta de plano. Não grava nada: quem persiste é a API."""
    resultado = ResultadoPlano()

    resultado.pendencias.extend(validar_entrada(entrada))
    if resultado.pendencias:
        log.info("Simulação interrompida: %d parâmetro(s) ausente(s)", len(resultado.pendencias))
        return resultado

    rendimentos = {r.erva: r for r in entrada.rendimentos}
    for demanda in entrada.demandas:
        try:
            resultado.necessidades.append(necessidade_fresca(demanda, rendimentos))
        except ParametroAusenteError as erro:
            resultado.pendencias.append(
                Pendencia(
                    tipo=TipoPendencia.PARAM_AUSENTE,
                    mensagem=str(erro),
                    erva=erro.erva,
                    demanda_id=demanda.id,
                )
            )

    if resultado.pendencias:
        return resultado

    _alocar(entrada, resultado)
    return resultado


def _alocar(entrada: EntradaPlanejamento, resultado: ResultadoPlano) -> None:
    """TODO: alocação gulosa dia a dia.

    Para cada dia do horizonte:
    - lotes disponíveis = chegaram até o dia e ainda não venceram
      (data_chegada + espera_maxima_dias); ordenar por vencimento e depois
      pela prioridade da demanda que atendem;
    - para cada secador livre (sem bloqueio), seguir a regra de prioridade
      (SCB03 maiores volumes, SCB01 picão, SCB02 menores volumes);
    - um secador processa uma erva por vez; trocar de erva custa
      setup_final (erva anterior) + setup_inicial (nova erva);
    - horas úteis do dia = regime_horas_dia − setup_diario − setups de troca;
    - kg do dia = horas úteis × kg_fresco_por_hora.
    Lote vencido com saldo → CAPACIDADE_EXCEDIDA.
    Necessidade não coberta até o prazo → ATRASO.
    """
    log.debug(
        "Alocação ainda não implementada (%d lotes, %d necessidades)",
        len(entrada.lotes),
        len(resultado.necessidades),
    )
