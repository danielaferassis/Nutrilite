"""POST /api/simulacoes: do cadastro no banco até o resultado do motor.

Usa as fixtures de tests/conftest.py (SQLite em memória, números sintéticos).
"""

from datetime import date
from decimal import Decimal

import pytest

from app.models import Capacidade, ModoCapacidade, PrevisaoOferta, Recebimento, Secador
from app.simulacao import montar_entrada
from tests.conftest import FONTE_A, GESTOR, PCP, TODOS_OS_DIAS, demanda, lote


def simular(cliente, **campos):
    cliente.logar(PCP)
    corpo = {"inicio": "2026-12-01", "fim": "2026-12-07", "dias_operacao": TODOS_OS_DIAS, **campos}
    return cliente.post("/api/simulacoes", json=corpo)


def tipos(resposta):
    return [p["tipo"] for p in resposta.json()["pendencias"]]


# --- Permissão e validação do pedido ---


def test_simulacao_exige_permissao(cliente):
    cliente.logar(FONTE_A)
    corpo = {"inicio": "2026-12-01", "fim": "2026-12-07", "dias_operacao": TODOS_OS_DIAS}
    assert cliente.post("/api/simulacoes", json=corpo).status_code == 403


@pytest.mark.parametrize(
    "campos",
    [
        {"fim": "2026-11-30"},  # antes do início
        {"fim": "2027-12-31"},  # horizonte longo demais
        {"dias_operacao": [7]},  # fora de 0–6
    ],
)
def test_simulacao_rejeita_pedido_invalido(cliente, campos):
    assert simular(cliente, **campos).status_code == 422


# --- Do banco ao motor ---


def test_simulacao_viavel_cobre_a_demanda(cliente, cadastro):
    demanda(cadastro)
    lote(cadastro)

    resposta = simular(cliente)

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["viavel"] is True
    assert corpo["pendencias"] == []
    assert corpo["necessidades"][0]["kg_fresco"] == pytest.approx(625)
    alocacoes = corpo["alocacoes"]
    assert sum(a["kg_fresco"] for a in alocacoes) == pytest.approx(800)
    assert sum(a["kg_fresco"] for a in alocacoes if a["demanda_id"] == "1") == pytest.approx(625)
    assert {a["secador"] for a in alocacoes} == {"SEC-1"}
    assert corpo["kpis"]["ocupacao_planejada_pct"]["SEC-1"] is not None
    assert (corpo["kpis"]["kg_perdido"], corpo["kpis"]["perda_pct"]) == ({"ERVA-A": 0}, {"ERVA-A": 0.0})
    assert corpo["avisos"] == []


def test_dias_de_operacao_omitidos_viram_pendencia(cliente, cadastro):
    demanda(cadastro)
    lote(cadastro)

    resposta = simular(cliente, dias_operacao=None)

    assert resposta.json()["viavel"] is False
    assert tipos(resposta) == ["param_ausente"]
    assert resposta.json()["dias_operacao"] is None


def test_parametro_de_capacidade_ausente_vira_pendencia(cliente, cadastro):
    cadastro.get(Capacidade, 1).kg_fresco_por_hora = None
    cadastro.commit()
    lote(cadastro)

    resposta = simular(cliente)

    pendencia = resposta.json()["pendencias"][0]
    assert pendencia["tipo"] == "param_ausente"
    assert pendencia["secador"] == "SEC-1"


def test_demanda_sem_oferta_gera_atraso_e_saldo(cliente, cadastro):
    demanda(cadastro)

    resposta = simular(cliente)

    assert sorted(tipos(resposta)) == ["atraso", "saldo_nao_alocado"]
    kpis = resposta.json()["kpis"]
    assert kpis["nao_atendido_no_prazo_kg"]["ERVA-A"] == pytest.approx(625)
    assert kpis["falta_de_oferta_kg"]["ERVA-A"] == pytest.approx(625)
    # Os kg aparecem uma vez só nas pendências (QA M3)
    kg = {p["tipo"]: p["kg"] for p in resposta.json()["pendencias"]}
    assert kg["atraso"] == pytest.approx(625) and kg["saldo_nao_alocado"] is None


def test_demanda_vencida_nao_entra_e_futura_entra_sem_atraso(cliente, cadastro):
    demanda(cadastro, prazo=date(2026, 11, 20))  # já passou
    demanda(cadastro, prazo=date(2026, 12, 20))  # vence depois do fim

    corpo = simular(cliente).json()

    assert [n["prazo"] for n in corpo["necessidades"]] == ["2026-12-20"]
    # Sem oferta no horizonte, mas não é atraso nem saldo deste plano
    assert corpo["viavel"] is True
    assert corpo["kpis"]["a_cobrir_apos_horizonte_kg"] == {"ERVA-A": 625}


def test_secador_inativo_nao_recebe_erva(cliente, cadastro):
    cadastro.add(Secador(id=2, codigo="SEC-2", nome="Secador sintético 2", ativo=False))
    cadastro.add(Capacidade(
        erva_id=1, secador_id=2, modo=ModoCapacidade.CONTINUO,
        kg_fresco_por_hora=Decimal(500), setup_inicial_h=Decimal(0),
        setup_final_h=Decimal(0), setup_diario_h=Decimal(0), setup_dentro_do_regime=True,
        prioridade=1,
    ))
    cadastro.commit()
    lote(cadastro)

    resposta = simular(cliente)

    assert {a["secador"] for a in resposta.json()["alocacoes"]} == {"SEC-1"}
    assert "SEC-2" not in resposta.json()["kpis"]["horas_disponiveis"]


def test_demanda_de_erva_inativa_vira_pendencia_e_nao_some(cliente, cadastro):
    demanda(cadastro, erva_id=3)

    resposta = simular(cliente)

    assert tipos(resposta) == ["param_ausente"]
    assert resposta.json()["pendencias"][0]["erva"] == "ERVA-INATIVA"


def test_entrada_inclui_lote_que_ainda_espera_no_inicio(cadastro):
    lote(cadastro, data_chegada=date(2026, 11, 28))  # espera 3 dias: vence em 01/12
    lote(cadastro, data_chegada=date(2026, 11, 20))  # já venceu
    lote(cadastro, data_chegada=date(2026, 12, 9))  # chega depois do fim

    entrada = montar_entrada(
        cadastro, date(2026, 12, 1), date(2026, 12, 7), frozenset(TODOS_OS_DIAS)
    )

    assert [lote.data_chegada for lote in entrada.lotes] == [date(2026, 11, 28)]
    assert entrada.bloqueios == []



# --- Lote em dois planos seguidos (QA M7) ---

ANTES = date(2026, 11, 30)  # dia do plano anterior; o novo começa em 01/12


def plano_do_dia(cliente, dia=ANTES, aprovar=True) -> dict:
    cliente.logar(PCP)
    plano = cliente.post(
        "/api/planos", json={"inicio": str(dia), "fim": str(dia), "dias_operacao": TODOS_OS_DIAS}
    ).json()
    if aprovar:
        cliente.logar(GESTOR)
        assert cliente.post(f"/api/planos/{plano['id']}/aprovar").status_code == 200
    return plano


def kg_no_plano(plano: dict, lote_id: str) -> float:
    return sum(float(a["kg_fresco"]) for a in plano["alocacoes"] if a["lote_id"] == lote_id)


def entrada_seguinte(cadastro):
    return montar_entrada(cadastro, date(2026, 12, 1), date(2026, 12, 7), frozenset(TODOS_OS_DIAS))


def test_lote_seco_em_parte_no_plano_anterior_entra_so_com_o_saldo(cliente, cadastro):
    lote(cadastro, data_chegada=ANTES, kg_fresco=Decimal(5000))  # não cabe num dia
    anterior = plano_do_dia(cliente)
    seco = kg_no_plano(anterior, "1")
    assert 0 < seco < 5000

    (restante,) = entrada_seguinte(cadastro).lotes

    assert (restante.id, restante.kg_fresco) == ("1", pytest.approx(5000 - seco))


def test_lote_todo_seco_no_plano_anterior_sai_da_entrada(cliente, cadastro):
    lote(cadastro, data_chegada=ANTES, kg_fresco=Decimal(500))
    assert kg_no_plano(plano_do_dia(cliente), "1") == 500

    assert entrada_seguinte(cadastro).lotes == []


def test_rascunho_nao_desconta(cliente, cadastro):
    lote(cadastro, data_chegada=ANTES, kg_fresco=Decimal(500))
    plano_do_dia(cliente, aprovar=False)

    assert [lote.kg_fresco for lote in entrada_seguinte(cadastro).lotes] == [500]


def test_recebimento_herda_o_que_o_plano_destinou_a_previsao(cliente, cadastro):
    lote(cadastro, data_chegada=ANTES, kg_fresco=Decimal(5000))
    seco = kg_no_plano(plano_do_dia(cliente), "1")
    # A erva chegou depois de aprovado o plano, com um pouco menos que o previsto
    previsao = cadastro.get(PrevisaoOferta, 1)
    cadastro.add(Recebimento(
        previsao_id=previsao.id, erva_id=1, origem=previsao.origem, data_recebimento=ANTES,
        kg_fresco=Decimal(4800), registrado_por_id=PCP,
    ))
    cadastro.commit()

    (restante,) = entrada_seguinte(cadastro).lotes

    assert (restante.id, restante.kg_fresco) == ("R1", pytest.approx(4800 - seco))


def test_simular_de_novo_o_mesmo_periodo_nao_desconta(cliente, cadastro):
    """Só o que o plano destinou a dias *antes* do início sai do lote."""
    lote(cadastro, data_chegada=ANTES, kg_fresco=Decimal(500))
    plano_do_dia(cliente)

    entrada = montar_entrada(cadastro, ANTES, date(2026, 12, 6), frozenset(TODOS_OS_DIAS))

    assert [lote.kg_fresco for lote in entrada.lotes] == [500]
