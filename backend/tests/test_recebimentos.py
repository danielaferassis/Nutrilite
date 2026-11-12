"""Recebimentos, efeito na simulação e cronograma.

Usa as fixtures de tests/conftest.py (SQLite em memória, números sintéticos).
"Hoje" fica fixo em 05/12/2026 para as regras de data futura e atraso.
"""

from datetime import date
from decimal import Decimal

import pytest

from app import calendario
from app.models import PrevisaoOferta
from tests.conftest import CONSULTA, FONTE_A, GESTOR, PCP, TODOS_OS_DIAS, demanda, lote

HOJE = date(2026, 12, 5)


@pytest.fixture(autouse=True)
def hoje_fixo(monkeypatch):
    monkeypatch.setattr(calendario, "hoje", lambda: HOJE)


@pytest.fixture
def previsto(cadastro):
    """Previsão #1: 800 kg da erva A, Procompete, chegada 01/12."""
    lote(cadastro)
    return cadastro


def receber(cliente, **campos):
    cliente.logar(PCP)
    corpo = {"previsao_id": 1, "data_recebimento": "2026-12-02", "kg_fresco": "500", **campos}
    return cliente.post("/api/recebimentos", json=corpo)


# --- Recebimentos ---


def test_recebimento_exige_permissao(cliente, previsto):
    cliente.logar(FONTE_A)
    assert cliente.get("/api/recebimentos").status_code == 403
    cliente.logar(CONSULTA)
    assert cliente.get("/api/recebimentos").status_code == 200
    corpo = {"previsao_id": 1, "data_recebimento": "2026-12-02", "kg_fresco": "500"}
    assert cliente.post("/api/recebimentos", json=corpo).status_code == 403


def test_recebimento_copia_erva_e_origem_da_previsao(cliente, previsto):
    resposta = receber(cliente)

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["previsao_id"] == 1
    assert corpo["erva"]["codigo"] == "ERVA-A"
    assert corpo["origem"] == "procompete"
    assert corpo["registrado_por"]["id"] == PCP


def test_chegada_nao_prevista_exige_erva_e_origem(cliente, previsto):
    sem_origem = {"previsao_id": None, "erva_id": 1}
    assert receber(cliente, **sem_origem).status_code == 422
    completa = {"previsao_id": None, "erva_id": 1, "origem": "pd"}
    assert receber(cliente, **completa).status_code == 201


@pytest.mark.parametrize(
    "campos",
    [
        {"erva_id": 2},  # com previsão, erva vem dela
        {"data_recebimento": "2026-12-06"},  # amanhã
        {"previsao_id": 99},
        {"kg_fresco": "0"},
        {"previsao_id": None, "erva_id": 3, "origem": "pd"},  # erva inativa
    ],
)
def test_recebimento_rejeita_valores_invalidos(cliente, previsto, campos):
    assert receber(cliente, **campos).status_code == 422


def test_corrige_recebimento_mas_nao_para_o_futuro(cliente, previsto):
    recebimento_id = receber(cliente).json()["id"]

    resposta = cliente.patch(f"/api/recebimentos/{recebimento_id}", json={"kg_fresco": "480"})
    assert float(resposta.json()["kg_fresco"]) == 480

    futuro = {"data_recebimento": "2026-12-31"}
    assert cliente.patch(f"/api/recebimentos/{recebimento_id}", json=futuro).status_code == 422


def test_previsao_recebida_fica_travada(cliente, previsto):
    cliente.logar(PCP)
    assert cliente.get("/api/previsoes/1").json()["recebida"] is False
    recebimento_id = receber(cliente).json()["id"]

    assert cliente.get("/api/previsoes").json()[0]["recebida"] is True
    assert cliente.patch("/api/previsoes/1", json={"kg_fresco": "1"}).status_code == 409
    assert cliente.delete("/api/previsoes/1").status_code == 409

    # Desfeito o recebimento, a previsão volta a ser editável
    cliente.delete(f"/api/recebimentos/{recebimento_id}")
    resposta = cliente.patch("/api/previsoes/1", json={"kg_fresco": "700"})
    assert resposta.status_code == 200
    assert resposta.json()["recebida"] is False


# --- Efeito na simulação ---


def simular(cliente):
    cliente.logar(PCP)
    return cliente.post("/api/simulacoes", json={
        "inicio": "2026-12-01", "fim": "2026-12-07", "dias_operacao": TODOS_OS_DIAS,
    }).json()


def test_simulacao_usa_o_recebido_no_lugar_do_previsto(cliente, previsto):
    receber(cliente, data_recebimento="2026-12-02", kg_fresco="500")

    alocacoes = simular(cliente)["alocacoes"]

    assert {a["lote_id"] for a in alocacoes} == {"R1"}
    assert sum(a["kg_fresco"] for a in alocacoes) == pytest.approx(500)
    assert min(a["dia"] for a in alocacoes) == "2026-12-02"


def test_entrega_parcial_e_chegada_nao_prevista_entram_na_simulacao(cliente, previsto):
    receber(cliente, data_recebimento="2026-12-01", kg_fresco="300")
    receber(cliente, data_recebimento="2026-12-03", kg_fresco="200")
    receber(cliente, previsao_id=None, erva_id=1, origem="pd", kg_fresco="100")

    alocacoes = simular(cliente)["alocacoes"]

    assert {a["lote_id"] for a in alocacoes} == {"R1", "R2", "R3"}
    assert sum(a["kg_fresco"] for a in alocacoes) == pytest.approx(600)


# --- Cronograma ---


def cronograma(cliente, usuario=PCP, de="2026-12-01", ate="2026-12-07"):
    cliente.logar(usuario)
    return cliente.get("/api/cronograma", params={"de": de, "ate": ate})


def test_cronograma_mostra_situacao_e_desvio_das_chegadas(cliente, cadastro):
    lote(cadastro, data_chegada=date(2026, 12, 1), kg_fresco=Decimal(800))  # recebida
    lote(cadastro, data_chegada=date(2026, 12, 3), kg_fresco=Decimal(400))  # atrasada
    lote(cadastro, data_chegada=date(2026, 12, 6), kg_fresco=Decimal(300))  # aguardando
    receber(cliente, previsao_id=1, data_recebimento="2026-12-01", kg_fresco="500")
    receber(cliente, previsao_id=None, erva_id=1, origem="pd", kg_fresco="100")

    chegadas = cronograma(cliente).json()["chegadas"]

    resumo = [(c["previsao_id"], c["situacao"], c["desvio_kg"]) for c in chegadas]
    assert [(p, s) for p, s, _ in resumo] == [
        (1, "recebida"), (2, "atrasada"), (3, "aguardando"), (None, "nao_prevista"),
    ]
    assert float(chegadas[0]["desvio_kg"]) == -300
    assert chegadas[1]["desvio_kg"] is None
    assert float(chegadas[3]["kg_recebido"]) == 100


def test_cronograma_inclui_previsao_antiga_recebida_no_periodo(cliente, cadastro):
    lote(cadastro, data_chegada=date(2026, 11, 28))
    receber(cliente, previsao_id=1, data_recebimento="2026-12-02")

    chegadas = cronograma(cliente).json()["chegadas"]

    assert [c["previsao_id"] for c in chegadas] == [1]
    assert chegadas[0]["data_prevista"] == "2026-11-28"


def test_cronograma_mostra_linha_do_tempo_e_so_alocacoes_vigentes(cliente, previsto):
    demanda(previsto)
    corpo = {"inicio": "2026-12-01", "fim": "2026-12-07", "dias_operacao": TODOS_OS_DIAS}
    cliente.logar(PCP)
    v1 = cliente.post("/api/planos", json=corpo).json()["id"]
    v2 = cliente.post("/api/planos", json=corpo).json()["id"]
    cliente.post("/api/planos", json=corpo)  # v3 fica rascunho
    cliente.logar(GESTOR)
    cliente.post(f"/api/planos/{v1}/aprovar")
    cliente.post(f"/api/planos/{v2}/aprovar")

    resposta = cronograma(cliente, usuario=CONSULTA).json()

    assert [(p["versao"], p["status"]) for p in resposta["planos"]] == [
        (1, "substituido"), (2, "aprovado"),
    ]
    assert {a["versao"] for a in resposta["alocacoes"]} == {2}
    assert resposta["hoje"] == "2026-12-05"


def test_cronograma_exige_permissao_e_periodo_valido(cliente, cadastro):
    assert cronograma(cliente, usuario=FONTE_A).status_code == 403
    assert cronograma(cliente, de="2026-12-07", ate="2026-12-01").status_code == 422
    assert cronograma(cliente, de="2026-01-01", ate="2027-12-31").status_code == 422


def test_previsao_sem_recebimento_continua_na_simulacao(cliente, previsto):
    assert previsto.get(PrevisaoOferta, 1).recebimentos == []
    assert {a["lote_id"] for a in simular(cliente)["alocacoes"]} == {"1"}
