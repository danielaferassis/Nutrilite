"""Testes de cenário da alocação gulosa e dos KPIs.

Todos os valores são fictícios e foram escolhidos para dar contas redondas.
O horizonte padrão é a semana de 02/11/2026 (segunda) a 06/11/2026 (sexta).
"""

from dataclasses import replace
from datetime import date

import pytest

from app.planner import simular
from app.planner.types import (
    BloqueioSecador,
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

SEG, TER, QUA, QUI, SEX, SAB = (date(2026, 11, d) for d in range(2, 8))
SEG_A_SEX = frozenset({0, 1, 2, 3, 4})

CAMOMILA = Erva("CAMOMILA", "Camomila", regime_horas_dia=12, espera_maxima_dias=1)
AGRIAO = Erva("AGRIAO", "Agrião", regime_horas_dia=24, espera_maxima_dias=1)


def capacidade(erva, secador, kg_h, inicial, final, diario, **extra) -> Capacidade:
    return Capacidade(
        erva,
        secador,
        kg_fresco_por_hora=kg_h,
        setup_inicial_h=inicial,
        setup_final_h=final,
        setup_diario_h=diario,
        modo=ModoCapacidade.CONTINUO,
        setup_dentro_do_regime=True,
        **extra,
    )


CAM_SCB03 = capacidade("CAMOMILA", "SCB03", 100, inicial=3, final=9, diario=1)
AGR_SCB01 = capacidade("AGRIAO", "SCB01", 100, inicial=2, final=2, diario=2)
AGR_SCB03 = capacidade("AGRIAO", "SCB03", 200, inicial=2, final=4, diario=2)


def lote(id, erva, dia, kg) -> LotePrevisto:
    return LotePrevisto(id, erva, Origem.FAZENDA_PROPRIA, dia, kg)


def entrada(**campos) -> EntradaPlanejamento:
    base = dict(
        inicio=SEG,
        fim=SEX,
        ervas=[CAMOMILA, AGRIAO],
        secadores=[Secador("SCB01", "Elétrico"), Secador("SCB03", "GLP")],
        capacidades=[CAM_SCB03, AGR_SCB01],
        rendimentos=[
            Rendimento("CAMOMILA", fresco_por_desidratado=6, desidratado_por_moido=1),
            Rendimento("AGRIAO", fresco_por_desidratado=10, desidratado_por_moido=1),
        ],
        dias_operacao=SEG_A_SEX,
    )
    base.update(campos)
    return EntradaPlanejamento(**base)


def linhas(resultado) -> list[tuple]:
    """Alocações como tuplas comparáveis: (secador, dia, lote, demanda, kg, h secagem, h setup)."""
    return [
        (a.secador, a.dia, a.lote_id, a.demanda_id, a.kg_fresco, a.horas_secagem, a.horas_setup)
        for a in resultado.alocacoes
    ]


def pendencias(resultado, tipo: TipoPendencia) -> list:
    return [p for p in resultado.pendencias if p.tipo == tipo]


# ---------------------------------------------------------------------------
# Cenário principal: 2 secadores, 2 ervas, lote que não cabe, demanda atrasada
# ---------------------------------------------------------------------------


@pytest.fixture
def cenario():
    return simular(
        entrada(
            lotes=[
                lote("L1", "CAMOMILA", SEG, 1000),
                lote("L2", "AGRIAO", SEG, 2000),
                lote("L3", "AGRIAO", QUA, 5000),  # grande demais: vence na quinta
            ],
            demandas=[
                # 150 kg desidratado × 6 = 900 kg fresco
                Demanda("D1", "CAMOMILA", 150, Estagio.DESIDRATADO, prazo=QUA),
                # 300 kg desidratado × 10 = 3000 kg fresco, mas só 2000 chegam até o prazo
                Demanda("D2", "AGRIAO", 300, Estagio.DESIDRATADO, prazo=TER),
            ],
        )
    )


def test_cenario_alocacoes_dia_a_dia(cenario):
    assert linhas(cenario) == [
        # SEG: agrião abre campanha (inicial 2 + diário 2 → 20 h × 100 kg/h)
        ("SCB01", SEG, "L2", "D2", 2000, 20, 4),
        # SEG: camomila abre campanha (inicial 3 + diário 1 → 8 h × 100 kg/h)
        ("SCB03", SEG, "L1", "D1", 800, 8, 4),
        # TER: os 200 kg restantes cabem com a limpeza (diário 1 + final 9 → 2 h):
        # a campanha encerra. 100 kg completam D1; 100 kg ficam sem demanda.
        ("SCB03", TER, "L1", "D1", 100, 1, 10),
        ("SCB03", TER, "L1", None, 100, 1, 0),
        # QUA e QUI: agrião continua a campanha (só diário 2 → 22 h). D2 já venceu.
        ("SCB01", QUA, "L3", None, 2200, 22, 2),
        ("SCB01", QUI, "L3", None, 2200, 22, 2),
    ]


def test_cenario_lote_que_nao_cabe_gera_capacidade_excedida(cenario):
    [perda] = pendencias(cenario, TipoPendencia.CAPACIDADE_EXCEDIDA)

    assert perda.lote_id == "L3"
    assert perda.kg == 600  # 5000 − 2200 − 2200
    assert "05/11/2026" in perda.mensagem


def test_cenario_demanda_fora_do_prazo_gera_atraso(cenario):
    [atraso] = pendencias(cenario, TipoPendencia.ATRASO)

    assert atraso.demanda_id == "D2"
    assert atraso.kg == 1000  # 3000 − 2000 secos até terça
    assert not pendencias(cenario, TipoPendencia.SALDO_NAO_ALOCADO)  # oferta existe, chegou tarde
    assert not cenario.viavel


def test_cenario_kpis(cenario):
    # 5 dias úteis × 24 h = 120 h por secador
    assert cenario.kpis["horas_disponiveis"] == {"SCB01": 120, "SCB03": 120}
    # SCB01: 24 + 24 + 24 h. SCB03: (8 + 4) + (2 + 10) h.
    assert cenario.kpis["horas_ocupadas"] == {"SCB01": 72, "SCB03": 24}
    assert cenario.kpis["ocupacao_planejada_pct"] == {"SCB01": 60.0, "SCB03": 20.0}
    assert cenario.kpis["saldo_nao_alocado_kg"] == {"AGRIAO": 1000, "CAMOMILA": 0}


# ---------------------------------------------------------------------------
# Regras isoladas
# ---------------------------------------------------------------------------


def test_plano_que_cabe_e_viavel():
    resultado = simular(
        entrada(
            lotes=[lote("L1", "CAMOMILA", SEG, 800)],
            demandas=[Demanda("D1", "CAMOMILA", 100, Estagio.DESIDRATADO, prazo=SEX)],
        )
    )

    assert resultado.viavel
    assert sum(a.kg_fresco for a in resultado.alocacoes) == 800
    assert resultado.kpis["saldo_nao_alocado_kg"] == {"CAMOMILA": 0}


def test_troca_de_erva_cobra_limpeza_da_anterior_no_primeiro_dia_da_nova():
    resultado = simular(
        entrada(
            capacidades=[CAM_SCB03, AGR_SCB03],
            secadores=[Secador("SCB03", "GLP")],
            lotes=[lote("L1", "CAMOMILA", SEG, 800), lote("L2", "AGRIAO", TER, 1000)],
        )
    )

    # SEG: camomila 8 h; a campanha fica aberta (com a limpeza não sobraria hora útil).
    # TER: agrião = diário 2 + inicial 2 + limpeza da camomila 9 + final do agrião 4 = 17 h
    # de setup; sobram 7 h × 200 kg/h = 1400 kg ≥ 1000 kg, então a campanha encerra.
    assert linhas(resultado) == [
        ("SCB03", SEG, "L1", None, 800, 8, 4),
        ("SCB03", TER, "L2", None, 1000, 5, 17),
    ]


def test_erva_vai_para_o_secador_que_seca_mais_e_o_outro_reforca():
    agriao_sem_espera = replace(AGRIAO, espera_maxima_dias=0)

    resultado = simular(
        entrada(
            ervas=[CAMOMILA, agriao_sem_espera],
            capacidades=[AGR_SCB01, AGR_SCB03],
            lotes=[lote("L1", "AGRIAO", SEG, 6000)],
        )
    )

    # SCB03 (200 kg/h, 20 h) fica com 4000 kg; SCB01 seca os 2000 kg restantes.
    kg_por_secador = {a.secador: a.kg_fresco for a in resultado.alocacoes}
    assert kg_por_secador == {"SCB03": 4000, "SCB01": 2000}
    assert not pendencias(resultado, TipoPendencia.CAPACIDADE_EXCEDIDA)


def test_secador_bloqueado_nao_recebe_alocacao():
    resultado = simular(
        entrada(
            lotes=[lote("L1", "CAMOMILA", SEG, 800)],
            bloqueios=[BloqueioSecador("SCB03", inicio=SEG, fim=SEG, motivo="manutenção")],
        )
    )

    assert [a.dia for a in resultado.alocacoes] == [TER]
    assert resultado.kpis["horas_disponiveis"]["SCB03"] == 96  # 4 dias × 24 h


def test_lote_que_chega_no_fim_de_semana_vence_sem_secador():
    resultado = simular(
        entrada(
            fim=date(2026, 11, 9),  # segunda seguinte
            lotes=[lote("L1", "AGRIAO", SAB, 500)],  # vence no domingo
        )
    )

    [perda] = pendencias(resultado, TipoPendencia.CAPACIDADE_EXCEDIDA)
    assert perda.lote_id == "L1"
    assert perda.kg == 500
    assert not resultado.alocacoes


def test_demanda_de_maior_prioridade_e_atendida_primeiro():
    resultado = simular(
        entrada(
            lotes=[lote("L1", "CAMOMILA", SEG, 800)],
            demandas=[
                Demanda("D-baixa", "CAMOMILA", 100, Estagio.DESIDRATADO, prazo=SEG),
                Demanda("D-alta", "CAMOMILA", 100, Estagio.DESIDRATADO, prazo=SEG, prioridade=5),
            ],
        )
    )

    destino = {a.demanda_id: a.kg_fresco for a in resultado.alocacoes}
    assert destino == {"D-alta": 600, "D-baixa": 200}
    [atraso] = pendencias(resultado, TipoPendencia.ATRASO)
    assert (atraso.demanda_id, atraso.kg) == ("D-baixa", 400)


def test_necessidade_sem_oferta_gera_saldo_nao_alocado():
    resultado = simular(
        entrada(demandas=[Demanda("D1", "AGRIAO", 50, Estagio.DESIDRATADO, prazo=SEX)])
    )

    [saldo] = pendencias(resultado, TipoPendencia.SALDO_NAO_ALOCADO)
    assert (saldo.erva, saldo.kg) == ("AGRIAO", 500)
    assert resultado.kpis["saldo_nao_alocado_kg"] == {"AGRIAO": 500}


def test_capacidade_por_carga_usa_cargas_inteiras():
    por_carga = replace(
        CAM_SCB03,
        kg_fresco_por_hora=None,
        modo=ModoCapacidade.POR_CARGA,
        kg_por_carga=350,
        horas_por_carga=4,
    )

    resultado = simular(
        entrada(capacidades=[por_carga], lotes=[lote("L1", "CAMOMILA", SEG, 1000)])
    )

    # SEG: 8 h úteis → 2 cargas (700 kg). TER: sobram 300 kg; com a limpeza ficam
    # 2 h (nenhuma carga), então segue sem encerrar: 1 carga parcial ocupa 4 h.
    assert [(a.dia, a.kg_fresco, a.horas_secagem) for a in resultado.alocacoes] == [
        (SEG, 700, 8),
        (TER, 300, 4),
    ]


def test_ocupacao_sem_dia_disponivel_e_nao_aplicavel():
    resultado = simular(entrada(inicio=SAB, fim=date(2026, 11, 8)))

    assert resultado.kpis["ocupacao_planejada_pct"] == {"SCB01": None, "SCB03": None}
    assert resultado.kpis["saldo_nao_alocado_kg"] == {}
