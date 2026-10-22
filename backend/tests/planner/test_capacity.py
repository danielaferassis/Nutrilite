"""Testes da capacidade diária dos secadores.

Valores de setup, regime e carga são fictícios, inspirados no relatório da
etapa 1, e ainda não foram validados pelo PCP.
"""

from dataclasses import replace
from datetime import date

import pytest

from app.planner.capacity import (
    cargas_no_dia,
    horas_setup_dia,
    horas_uteis,
    kg_no_dia,
    secador_disponivel,
)
from app.planner.conversion import ParametroAusenteError
from app.planner.types import BloqueioSecador, Capacidade, Erva, ModoCapacidade

SEG_A_SEX = frozenset({0, 1, 2, 3, 4})

CAMOMILA = Erva("CAMOMILA", "Camomila", regime_horas_dia=12, espera_maxima_dias=2)
AGRIAO = Erva("AGRIAO", "Agrião", regime_horas_dia=24, espera_maxima_dias=1)

CAP_CAMOMILA = Capacidade(
    "CAMOMILA",
    "SCB03",
    kg_fresco_por_hora=100,
    setup_inicial_h=3,
    setup_final_h=9,
    setup_diario_h=1,
    modo=ModoCapacidade.CONTINUO,
    setup_dentro_do_regime=True,
)
CAP_CAMOMILA_CARGA = replace(
    CAP_CAMOMILA,
    kg_fresco_por_hora=None,
    modo=ModoCapacidade.POR_CARGA,
    kg_por_carga=350,
    horas_por_carga=4,
)
CAP_CAMOMILA_FORA = replace(CAP_CAMOMILA, setup_dentro_do_regime=False)
CAP_AGRIAO = Capacidade(
    "AGRIAO",
    "SCB03",
    kg_fresco_por_hora=250,
    setup_inicial_h=2,
    setup_final_h=4,
    setup_diario_h=2,
    modo=ModoCapacidade.CONTINUO,
    setup_dentro_do_regime=True,
)

MANUTENCAO = BloqueioSecador("SCB03", inicio=date(2026, 11, 4), fim=date(2026, 11, 6), motivo="manutenção")


def horas_da_campanha(erva: Erva, cap: Capacidade, dias: int) -> list[float]:
    """Horas úteis de cada dia de uma campanha isolada (sem erva anterior)."""
    return [
        horas_uteis(erva, cap, horas_setup_dia(cap, primeiro_dia=i == 0, encerra_campanha=i == dias - 1))
        for i in range(dias)
    ]


# ---------------------------------------------------------------------------
# Casos obrigatórios (camomila: regime 12 h, setups 3/9/1)
# ---------------------------------------------------------------------------


def test_camomila_campanha_de_um_dia_nao_tem_hora_util():
    # inicial 3 + diário 1 + final 9 = 13 h de setup > 12 h de regime
    assert horas_da_campanha(CAMOMILA, CAP_CAMOMILA, dias=1) == [0]


def test_camomila_campanha_de_tres_dias():
    # 12 − (3 + 1) = 8; 12 − 1 = 11; 12 − (1 + 9) = 2
    assert horas_da_campanha(CAMOMILA, CAP_CAMOMILA, dias=3) == [8, 11, 2]


def test_camomila_por_carga_em_dia_intermediario():
    horas = horas_uteis(
        CAMOMILA, CAP_CAMOMILA_CARGA, horas_setup_dia(CAP_CAMOMILA_CARGA, False, False)
    )

    assert horas == 11
    assert cargas_no_dia(CAP_CAMOMILA_CARGA, horas) == 2  # 11 h / 4 h por carga
    assert kg_no_dia(CAP_CAMOMILA_CARGA, horas) == 700  # 2 × 350 kg


def test_camomila_setup_fora_do_turno_em_campanha_de_um_dia():
    # min(12, 24 − 13) = 11
    assert horas_da_campanha(CAMOMILA, CAP_CAMOMILA_FORA, dias=1) == [11]


# ---------------------------------------------------------------------------
# secador_disponivel
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("dia", "esperado"),
    [
        (date(2026, 11, 3), True),  # véspera
        (date(2026, 11, 4), False),  # primeiro dia do bloqueio (inclusivo)
        (date(2026, 11, 5), False),
        (date(2026, 11, 6), False),  # último dia do bloqueio (inclusivo)
        (date(2026, 11, 9), True),  # segunda seguinte
    ],
)
def test_bloqueio_cobre_inicio_e_fim(dia, esperado):
    assert secador_disponivel("SCB03", dia, [MANUTENCAO], SEG_A_SEX) is esperado


def test_bloqueio_de_outro_secador_nao_afeta():
    assert secador_disponivel("SCB01", date(2026, 11, 5), [MANUTENCAO], SEG_A_SEX)


def test_varios_bloqueios_do_mesmo_secador():
    feriado = BloqueioSecador("SCB03", inicio=date(2026, 11, 20), fim=date(2026, 11, 20))

    assert not secador_disponivel("SCB03", date(2026, 11, 20), [MANUTENCAO, feriado], SEG_A_SEX)
    assert secador_disponivel("SCB03", date(2026, 11, 10), [MANUTENCAO, feriado], SEG_A_SEX)


def test_dia_fora_dos_dias_de_operacao_e_indisponivel():
    sabado = date(2026, 11, 7)

    assert not secador_disponivel("SCB03", sabado, [], SEG_A_SEX)
    assert secador_disponivel("SCB03", sabado, [], frozenset(range(7)))


def test_dias_de_operacao_ausente_gera_erro():
    with pytest.raises(ParametroAusenteError):
        secador_disponivel("SCB03", date(2026, 11, 3), [], None)


# ---------------------------------------------------------------------------
# horas_setup_dia
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("primeiro_dia", "encerra_campanha", "esperado"),
    [
        (True, False, 4),  # inicial 3 + diário 1
        (False, False, 1),  # só diário
        (False, True, 10),  # diário 1 + final 9
        (True, True, 13),  # campanha de 1 dia: tudo no mesmo dia
    ],
)
def test_setup_conforme_posicao_na_campanha(primeiro_dia, encerra_campanha, esperado):
    assert horas_setup_dia(CAP_CAMOMILA, primeiro_dia, encerra_campanha) == esperado


def test_troca_cobra_limpeza_da_anterior_no_primeiro_dia_da_nova():
    # agrião entrando depois da camomila: diário 2 + inicial 2 + final da camomila 9
    assert horas_setup_dia(CAP_AGRIAO, True, False, anterior=CAP_CAMOMILA) == 13
    # camomila depois do agrião: diário 1 + inicial 3 + final do agrião 4
    assert horas_setup_dia(CAP_CAMOMILA, True, False, anterior=CAP_AGRIAO) == 8


def test_troca_fora_do_primeiro_dia_e_rejeitada():
    with pytest.raises(ValueError):
        horas_setup_dia(CAP_AGRIAO, False, False, anterior=CAP_CAMOMILA)


def test_anterior_da_mesma_erva_nao_e_troca():
    with pytest.raises(ValueError):
        horas_setup_dia(CAP_CAMOMILA, True, False, anterior=CAP_CAMOMILA)


def test_anterior_de_outro_secador_e_rejeitada():
    camomila_scb01 = replace(CAP_CAMOMILA, secador="SCB01")

    with pytest.raises(ValueError):
        horas_setup_dia(CAP_AGRIAO, True, False, anterior=camomila_scb01)


def test_setup_ausente_gera_erro_em_vez_de_zero():
    with pytest.raises(ParametroAusenteError):
        horas_setup_dia(replace(CAP_CAMOMILA, setup_diario_h=None), False, False)
    with pytest.raises(ParametroAusenteError):
        horas_setup_dia(replace(CAP_CAMOMILA, setup_inicial_h=None), True, False)
    with pytest.raises(ParametroAusenteError):
        horas_setup_dia(CAP_AGRIAO, True, False, anterior=replace(CAP_CAMOMILA, setup_final_h=None))


def test_setup_diario_zero_e_valido():
    """0 é um valor informado, diferente de None (não informado)."""
    assert horas_setup_dia(replace(CAP_CAMOMILA, setup_diario_h=0), False, False) == 0


# ---------------------------------------------------------------------------
# horas_uteis
# ---------------------------------------------------------------------------


def test_setup_dentro_do_regime_desconta_do_turno():
    assert horas_uteis(AGRIAO, CAP_AGRIAO, horas_setup=13) == 11  # 24 − 13


def test_setup_maior_que_o_regime_nao_gera_horas_negativas():
    assert horas_uteis(CAMOMILA, CAP_CAMOMILA, horas_setup=20) == 0


@pytest.mark.parametrize(
    ("horas_setup", "esperado"),
    [
        (0, 12),  # regime limita
        (12, 12),  # 24 − 12 = 12: ainda cabe o turno inteiro
        (13, 11),  # 24 − 13
        (30, 0),  # setup maior que o dia
    ],
)
def test_setup_fora_do_regime_limita_pelas_24_horas(horas_setup, esperado):
    assert horas_uteis(CAMOMILA, CAP_CAMOMILA_FORA, horas_setup) == esperado


def test_regime_ausente_gera_erro_em_vez_de_chutar():
    sem_regime = replace(CAMOMILA, regime_horas_dia=None)

    with pytest.raises(ParametroAusenteError):
        horas_uteis(sem_regime, CAP_CAMOMILA, horas_setup=1)


def test_setup_dentro_do_regime_ausente_gera_erro():
    with pytest.raises(ParametroAusenteError):
        horas_uteis(CAMOMILA, replace(CAP_CAMOMILA, setup_dentro_do_regime=None), horas_setup=1)


# ---------------------------------------------------------------------------
# cargas_no_dia e kg_no_dia
# ---------------------------------------------------------------------------


def test_kg_continuo():
    assert kg_no_dia(CAP_CAMOMILA, 11) == pytest.approx(1100)


def test_por_carga_ignora_carga_incompleta():
    assert cargas_no_dia(CAP_CAMOMILA_CARGA, 7.9) == 1
    assert kg_no_dia(CAP_CAMOMILA_CARGA, 7.9) == 350


def test_por_carga_tolera_erro_de_ponto_flutuante():
    """0,7 / 0,1 vale 6,999… em float: sem tolerância, perderíamos uma carga."""
    carga_curta = replace(CAP_CAMOMILA_CARGA, horas_por_carga=0.1)

    assert cargas_no_dia(carga_curta, 0.7) == 7


def test_zero_horas_zero_kg():
    assert kg_no_dia(CAP_CAMOMILA, 0) == 0
    assert kg_no_dia(CAP_CAMOMILA_CARGA, 0) == 0


def test_horas_negativas_sao_rejeitadas():
    with pytest.raises(ValueError):
        kg_no_dia(CAP_CAMOMILA, -1)
    with pytest.raises(ValueError):
        cargas_no_dia(CAP_CAMOMILA_CARGA, -1)


def test_cargas_no_modo_continuo_e_rejeitado():
    with pytest.raises(ValueError):
        cargas_no_dia(CAP_CAMOMILA, 10)


def test_vazao_ausente_gera_erro():
    with pytest.raises(ParametroAusenteError):
        kg_no_dia(replace(CAP_CAMOMILA, kg_fresco_por_hora=None), 10)


def test_carga_ausente_gera_erro():
    with pytest.raises(ParametroAusenteError):
        kg_no_dia(replace(CAP_CAMOMILA_CARGA, kg_por_carga=None), 10)
    with pytest.raises(ParametroAusenteError):
        cargas_no_dia(replace(CAP_CAMOMILA_CARGA, horas_por_carga=None), 10)
