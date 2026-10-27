"""Testes do fluxo de simulação (validação + conversão).

Garantem o contrato: parâmetros ausentes interrompem a simulação com
pendências explicáveis. A alocação tem cenários em test_alocacao.py.
"""

from dataclasses import replace
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
    ModoCapacidade,
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
                modo=ModoCapacidade.CONTINUO,
                setup_dentro_do_regime=True,
            )
        ],
        rendimentos=[Rendimento("CAMOMILA", fresco_por_desidratado=6, desidratado_por_moido=1.02)],
        lotes=[LotePrevisto("L1", "CAMOMILA", Origem.FAZENDA_PROPRIA, date(2026, 11, 3), 1080)],
        demandas=[Demanda("D1", "CAMOMILA", 100, Estagio.MOIDO, prazo=date(2026, 11, 9))],
        dias_operacao=frozenset({0, 1, 2, 3, 4}),
    )
    base.update(alteracoes)
    return EntradaPlanejamento(**base)


def test_entrada_completa_nao_gera_pendencia_de_parametro():
    resultado = simular(entrada_valida())

    assert not [p for p in resultado.pendencias if p.tipo == TipoPendencia.PARAM_AUSENTE]
    assert len(resultado.necessidades) == 1
    assert resultado.necessidades[0].kg_fresco == pytest.approx(100 * 1.02 * 6)


def test_capacidade_incompleta_gera_param_ausente():
    capacidade = Capacidade(
        erva="CAMOMILA", secador="SCB03", kg_fresco_por_hora=100, modo=ModoCapacidade.CONTINUO
    )

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
    capacidade = replace(entrada_valida().capacidades[0], secador="SCB99")

    resultado = simular(entrada_valida(capacidades=[capacidade]))

    assert any(p.secador == "SCB99" for p in resultado.pendencias)


def test_horizonte_invertido():
    resultado = simular(entrada_valida(inicio=FIM, fim=INICIO))

    assert any("Horizonte" in p.mensagem for p in resultado.pendencias)


# ---------------------------------------------------------------------------
# Dias de operação
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "dias",
    [
        None,  # não informado
        frozenset(),  # nenhum dia: decidido como inválido
        frozenset({0, 7}),  # 7 não é dia da semana
        frozenset({-1, 2}),
    ],
)
def test_dias_de_operacao_ausentes_ou_invalidos(dias):
    resultado = simular(entrada_valida(dias_operacao=dias))

    assert not resultado.viavel
    assert any(
        p.tipo == TipoPendencia.PARAM_AUSENTE and "Dias de operação" in p.mensagem
        for p in resultado.pendencias
    )


# ---------------------------------------------------------------------------
# Modo de capacidade
# ---------------------------------------------------------------------------

CAP_BASE = Capacidade(
    "CAMOMILA",
    "SCB03",
    setup_inicial_h=3,
    setup_final_h=9,
    setup_diario_h=1,
    setup_dentro_do_regime=True,
)


def test_modo_ausente_gera_param_ausente():
    """Sem modo, o motor não assume CONTINUO por conta própria."""
    capacidade = replace(CAP_BASE, kg_fresco_por_hora=100)

    resultado = simular(entrada_valida(capacidades=[capacidade]))

    assert any("modo" in p.mensagem for p in resultado.pendencias)


def test_por_carga_exige_kg_e_horas_por_carga():
    capacidade = replace(CAP_BASE, modo=ModoCapacidade.POR_CARGA, kg_fresco_por_hora=100)

    resultado = simular(entrada_valida(capacidades=[capacidade]))

    mensagem = resultado.pendencias[0].mensagem
    assert "kg_por_carga" in mensagem and "horas_por_carga" in mensagem


def test_por_carga_nao_exige_vazao_horaria():
    capacidade = replace(
        CAP_BASE, modo=ModoCapacidade.POR_CARGA, kg_por_carga=350, horas_por_carga=4
    )

    resultado = simular(entrada_valida(capacidades=[capacidade]))

    assert not [p for p in resultado.pendencias if p.tipo == TipoPendencia.PARAM_AUSENTE]


def test_continuo_nao_exige_campos_de_carga():
    capacidade = replace(CAP_BASE, modo=ModoCapacidade.CONTINUO, kg_fresco_por_hora=100)

    resultado = simular(entrada_valida(capacidades=[capacidade]))

    assert not [p for p in resultado.pendencias if p.tipo == TipoPendencia.PARAM_AUSENTE]


@pytest.mark.parametrize(("kg", "horas"), [(0, 4), (350, 0), (-1, 4)])
def test_por_carga_com_valores_nao_positivos_e_invalido(kg, horas):
    capacidade = replace(
        CAP_BASE, modo=ModoCapacidade.POR_CARGA, kg_por_carga=kg, horas_por_carga=horas
    )

    resultado = simular(entrada_valida(capacidades=[capacidade]))

    assert any("maiores que zero" in p.mensagem for p in resultado.pendencias)


def test_setup_dentro_do_regime_ausente_gera_param_ausente():
    capacidade = replace(
        CAP_BASE, modo=ModoCapacidade.CONTINUO, kg_fresco_por_hora=100, setup_dentro_do_regime=None
    )

    resultado = simular(entrada_valida(capacidades=[capacidade]))

    assert any("setup_dentro_do_regime" in p.mensagem for p in resultado.pendencias)


def test_setup_fora_do_regime_false_e_valor_valido():
    """False é um valor informado (setup fora do turno), não ausência."""
    capacidade = replace(
        CAP_BASE, modo=ModoCapacidade.CONTINUO, kg_fresco_por_hora=100, setup_dentro_do_regime=False
    )

    resultado = simular(entrada_valida(capacidades=[capacidade]))

    assert not [p for p in resultado.pendencias if p.tipo == TipoPendencia.PARAM_AUSENTE]
