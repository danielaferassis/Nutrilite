"""Testes da conversão demanda → erva fresca.

Razões usadas aqui vêm do relatório da etapa 1 (planilhas do PCP) e ainda
precisam ser validadas com o PCP. São dados de teste, não parâmetros oficiais.
"""

from datetime import date

import pytest

from app.planner.conversion import (
    ParametroAusenteError,
    kg_fresco_necessario,
    necessidade_fresca,
)
from app.planner.types import Demanda, Estagio, Rendimento

CAMOMILA = Rendimento(erva="CAMOMILA", fresco_por_desidratado=6.0, desidratado_por_moido=1.02)
AGRIAO = Rendimento(erva="AGRIAO", fresco_por_desidratado=23.3, desidratado_por_moido=1.05)

SEMANA_46_2026 = date.fromisocalendar(2026, 46, 1)  # segunda-feira, 09/11/2026


def test_camomila_plano_2026_semana_46():
    """1.430 kg de camomila acabada (moída) para embarque na semana 46."""
    demanda = Demanda(
        id="D-CAM-2026",
        erva="CAMOMILA",
        kg=1430,
        estagio=Estagio.MOIDO,
        prazo=SEMANA_46_2026,
    )

    necessidade = necessidade_fresca(demanda, {"CAMOMILA": CAMOMILA})

    # 1430 kg moído × 1,02 = 1458,6 kg desidratado × 6 = 8751,6 kg fresco
    assert necessidade.kg_fresco == pytest.approx(8751.6)
    assert necessidade.kg_meta == 1430
    assert necessidade.prazo == date(2026, 11, 9)


def test_reserva_soma_na_meta():
    demanda = Demanda(
        id="D1",
        erva="CAMOMILA",
        kg=1000,
        reserva_kg=100,
        estagio=Estagio.DESIDRATADO,
        prazo=SEMANA_46_2026,
    )

    necessidade = necessidade_fresca(demanda, {"CAMOMILA": CAMOMILA})

    assert necessidade.kg_meta == 1100
    assert necessidade.kg_fresco == pytest.approx(6600)  # 1100 × 6


@pytest.mark.parametrize(
    ("estagio", "esperado"),
    [
        (Estagio.FRESCO, 100),
        (Estagio.DESIDRATADO, 100 * 23.3),
        (Estagio.MOIDO, 100 * 1.05 * 23.3),
    ],
)
def test_agriao_por_estagio(estagio, esperado):
    assert kg_fresco_necessario(100, estagio, AGRIAO) == pytest.approx(esperado)


def test_fresco_nao_precisa_de_rendimento():
    assert kg_fresco_necessario(500, Estagio.FRESCO, None) == 500


def test_rendimento_ausente_gera_erro_em_vez_de_chutar():
    demanda = Demanda(id="D2", erva="SALSA", kg=10, estagio=Estagio.MOIDO, prazo=SEMANA_46_2026)

    with pytest.raises(ParametroAusenteError) as erro:
        necessidade_fresca(demanda, rendimentos={})

    assert erro.value.erva == "SALSA"


def test_razao_de_moagem_ausente():
    incompleto = Rendimento(erva="PICAO", fresco_por_desidratado=5.0, desidratado_por_moido=None)

    with pytest.raises(ParametroAusenteError, match="moído"):
        kg_fresco_necessario(10, Estagio.MOIDO, incompleto)

    # Para meta desidratada, a razão de moagem não é necessária.
    assert kg_fresco_necessario(10, Estagio.DESIDRATADO, incompleto) == 50


def test_quantidade_negativa_e_rejeitada():
    with pytest.raises(ValueError):
        kg_fresco_necessario(-1, Estagio.FRESCO, None)
