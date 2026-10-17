"""Testes do fluxo de simulação (validação + conversão).

A alocação nos secadores ainda é TODO; estes testes garantem o contrato:
parâmetros ausentes interrompem a simulação com pendências explicáveis.
"""

from datetime import date

import pytest

from app.planner import simular
from app.planner.types import (
    Capacidade,
    Demanda,
    EntradaPlanejamento,
    Erva,
    Estagio,
    LotePrevisto,
    Origem,
    Rendimento,
    Secador,
    TipoPendencia,
)

INICIO = date(2026, 11, 2)
FIM = date(2026, 11, 13)


def entrada_valida(**alteracoes) -> EntradaPlanejamento:
    """Cenário mínimo completo: camomila no SCB03. Valores fictícios de teste."""
    base = dict(
        inicio=INICIO,
        fim=FIM,
        ervas=[Erva("CAMOMILA", "Camomila", regime_horas_dia=12, espera_maxima_dias=2)],
        secadores=[Secador("SCB03", "Secador GLP")],
        capacidades=[
            Capacidade(
                erva="CAMOMILA",
                secador="SCB03",
                kg_fresco_por_hora=100,
                setup_inicial_h=3,
                setup_final_h=9,
                setup_diario_h=1,
            )
        ],
        rendimentos=[Rendimento("CAMOMILA", fresco_por_desidratado=6, desidratado_por_moido=1.02)],
        lotes=[LotePrevisto("L1", "CAMOMILA", Origem.FAZENDA_PROPRIA, date(2026, 11, 3), 1080)],
        demandas=[Demanda("D1", "CAMOMILA", 100, Estagio.MOIDO, prazo=date(2026, 11, 9))],
    )
    base.update(alteracoes)
    return EntradaPlanejamento(**base)


def test_entrada_completa_nao_gera_pendencia_de_parametro():
    resultado = simular(entrada_valida())

    assert not [p for p in resultado.pendencias if p.tipo == TipoPendencia.PARAM_AUSENTE]
    assert len(resultado.necessidades) == 1
    assert resultado.necessidades[0].kg_fresco == pytest.approx(100 * 1.02 * 6)


def test_capacidade_incompleta_gera_param_ausente():
    capacidade = Capacidade(erva="CAMOMILA", secador="SCB03", kg_fresco_por_hora=100)

    resultado = simular(entrada_valida(capacidades=[capacidade]))

    assert not resultado.viavel
    pendencia = resultado.pendencias[0]
    assert pendencia.tipo == TipoPendencia.PARAM_AUSENTE
    assert pendencia.secador == "SCB03"
    assert "setup_inicial_h" in pendencia.mensagem


def test_espera_maxima_ausente_e_sinalizada():
    """Regra dos 15 dias ainda não confirmada: o motor não pode assumir um valor."""
    erva = Erva("CAMOMILA", "Camomila", regime_horas_dia=12, espera_maxima_dias=None)

    resultado = simular(entrada_valida(ervas=[erva]))

    assert any("espera" in p.mensagem for p in resultado.pendencias)


def test_erva_sem_cadastro():
    lote = LotePrevisto("L9", "SALSA", Origem.PD, date(2026, 11, 4), 200)

    resultado = simular(entrada_valida(lotes=[lote], demandas=[]))

    assert any(p.erva == "SALSA" and "não cadastrada" in p.mensagem for p in resultado.pendencias)


def test_secador_inexistente_na_capacidade():
    capacidade = Capacidade("CAMOMILA", "SCB99", 100, 3, 9, 1)

    resultado = simular(entrada_valida(capacidades=[capacidade]))

    assert any(p.secador == "SCB99" for p in resultado.pendencias)


def test_horizonte_invertido():
    resultado = simular(entrada_valida(inicio=FIM, fim=INICIO))

    assert any("Horizonte" in p.mensagem for p in resultado.pendencias)
