"""Erva com cadastro incompleto sai da simulação sem derrubar as demais (QA, 17/11/2026).

Antes, um único PARAM_AUSENTE zerava o plano inteiro: nenhuma alocação, nenhum
KPI, para todas as ervas. Agora só a erva incompleta fica de fora. O plano segue
inviável (não pode ser aprovado) e nada é preenchido com valor padrão.
"""

from dataclasses import replace

from app.planner import simular
from app.planner.types import Demanda, Estagio, Rendimento, TipoPendencia
from tests.planner.test_alocacao import AGR_SCB01, CAM_SCB03, SEG, TER, entrada, lote, pendencias

CAMOMILA_COM_RENDIMENTO = Rendimento("CAMOMILA", fresco_por_desidratado=6, desidratado_por_moido=1)


def ervas_com_alocacao(resultado) -> set[str]:
    return {a.erva for a in resultado.alocacoes}


def test_capacidade_incompleta_tira_so_a_erva_afetada():
    incompleta = replace(AGR_SCB01, setup_diario_h=None)

    resultado = simular(
        entrada(
            capacidades=[CAM_SCB03, incompleta],
            lotes=[lote("L-cam", "CAMOMILA", SEG, 300), lote("L-agr", "AGRIAO", SEG, 300)],
            demandas=[Demanda("D-cam", "CAMOMILA", 50, Estagio.DESIDRATADO, prazo=TER)],
        )
    )

    [ausente] = pendencias(resultado, TipoPendencia.PARAM_AUSENTE)
    assert ausente.erva == "AGRIAO"
    assert ervas_com_alocacao(resultado) == {"CAMOMILA"}
    assert [n.demanda_id for n in resultado.necessidades] == ["D-cam"]
    assert resultado.kpis["ocupacao_planejada_pct"]["SCB03"] is not None
    assert not resultado.viavel


def test_lote_da_erva_incompleta_nao_vira_perda_nem_saldo():
    # A erva fica fora do cálculo: o motor não sabe se cabia, então não acusa perda.
    resultado = simular(
        entrada(
            capacidades=[CAM_SCB03, replace(AGR_SCB01, modo=None)],
            lotes=[lote("L-agr", "AGRIAO", SEG, 5000)],
        )
    )

    assert {p.tipo for p in resultado.pendencias} == {TipoPendencia.PARAM_AUSENTE}
    assert not resultado.alocacoes


def test_demanda_sem_rendimento_tira_a_erva_e_mantem_a_outra():
    resultado = simular(
        entrada(
            rendimentos=[CAMOMILA_COM_RENDIMENTO],
            lotes=[lote("L-cam", "CAMOMILA", SEG, 300), lote("L-agr", "AGRIAO", SEG, 300)],
            demandas=[
                Demanda("D-cam", "CAMOMILA", 50, Estagio.DESIDRATADO, prazo=TER),
                Demanda("D-agr", "AGRIAO", 10, Estagio.MOIDO, prazo=TER),
            ],
        )
    )

    [ausente] = pendencias(resultado, TipoPendencia.PARAM_AUSENTE)
    assert ausente.erva == "AGRIAO" and "Rendimento" in ausente.mensagem
    assert ervas_com_alocacao(resultado) == {"CAMOMILA"}
    assert not pendencias(resultado, TipoPendencia.ATRASO)


def test_razao_ausente_na_conversao_tambem_tira_so_a_erva():
    # Rendimento cadastrado, mas sem a razão desidratado→moído: só a conversão percebe.
    resultado = simular(
        entrada(
            rendimentos=[CAMOMILA_COM_RENDIMENTO, Rendimento("AGRIAO", fresco_por_desidratado=10)],
            lotes=[lote("L-cam", "CAMOMILA", SEG, 300), lote("L-agr", "AGRIAO", SEG, 300)],
            demandas=[
                Demanda("D-cam", "CAMOMILA", 50, Estagio.DESIDRATADO, prazo=TER),
                Demanda("D-agr", "AGRIAO", 10, Estagio.MOIDO, prazo=TER),
            ],
        )
    )

    [ausente] = pendencias(resultado, TipoPendencia.PARAM_AUSENTE)
    assert (ausente.erva, ausente.demanda_id) == ("AGRIAO", "D-agr")
    assert ervas_com_alocacao(resultado) == {"CAMOMILA"}
    assert [n.demanda_id for n in resultado.necessidades] == ["D-cam"]


def test_erva_so_com_oferta_nao_precisa_de_rendimento():
    resultado = simular(
        entrada(rendimentos=[], lotes=[lote("L-agr", "AGRIAO", SEG, 300)])
    )

    assert not pendencias(resultado, TipoPendencia.PARAM_AUSENTE)
    assert ervas_com_alocacao(resultado) == {"AGRIAO"}


def test_demanda_em_fresco_nao_precisa_de_rendimento():
    resultado = simular(
        entrada(
            rendimentos=[],
            lotes=[lote("L-agr", "AGRIAO", SEG, 300)],
            demandas=[Demanda("D-agr", "AGRIAO", 200, Estagio.FRESCO, prazo=TER)],
        )
    )

    assert resultado.viavel
    assert sum(a.kg_fresco for a in resultado.alocacoes if a.demanda_id == "D-agr") == 200


def test_parametro_global_ausente_ainda_interrompe_tudo():
    resultado = simular(
        entrada(dias_operacao=None, lotes=[lote("L-cam", "CAMOMILA", SEG, 300)])
    )

    [ausente] = resultado.pendencias
    assert ausente.erva is None and "Dias de operação" in ausente.mensagem
    assert not resultado.alocacoes and not resultado.kpis
