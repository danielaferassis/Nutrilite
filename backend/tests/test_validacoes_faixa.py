"""Validações de faixa da entrada (QA M9 a M12).

Datas absurdas, duplicidades, valores sem sentido físico e inteiros sem teto.
Usa as fixtures de tests/conftest.py (SQLite em memória, números sintéticos).
"""

from datetime import date

import pytest

from app import calendario
from app.models import BloqueioSecador, Demanda
from tests.conftest import ADMIN_CADASTRO, PCP, lote

HOJE = date(2026, 11, 22)


@pytest.fixture(autouse=True)
def hoje_fixo(monkeypatch):
    monkeypatch.setattr(calendario, "hoje", lambda: HOJE)


def demanda(**campos):
    return {"erva_id": 1, "kg": "100", "estagio": "moido", "prazo": "2026-12-10", **campos}


def previsao(**campos):
    return {"erva_id": 1, "origem": "procompete", "data_chegada": "2026-12-01", "kg_fresco": "500", **campos}


def bloqueio(**campos):
    return {"secador_id": 1, "inicio": "2026-12-01", "fim": "2026-12-02", "motivo": "Manutenção fictícia", **campos}


# --- M9: datas absurdas ---


@pytest.mark.parametrize(
    ("rota", "corpo"),
    [
        ("/api/demandas", demanda(prazo="9999-12-31")),
        ("/api/demandas", demanda(prazo="2000-01-01")),
        ("/api/previsoes", previsao(data_chegada="1990-01-01")),
        ("/api/bloqueios", bloqueio(inicio="2026-12-01", fim="2099-01-01")),
    ],
)
def test_data_absurda_e_recusada(cliente, cadastro, rota, corpo):
    cliente.logar(PCP)

    resposta = cliente.post(rota, json=corpo)

    assert resposta.status_code == 422
    assert "fora do intervalo aceito (22/11/2025 a 22/11/2028)" in str(resposta.json()["detail"])


def test_recebimento_em_1900_e_recusado(cliente, cadastro):
    lote(cadastro)
    cliente.logar(PCP)

    resposta = cliente.post(
        "/api/recebimentos", json={"previsao_id": 1, "data_recebimento": "1900-01-01", "kg_fresco": "500"}
    )

    assert resposta.status_code == 422


def test_datas_nas_pontas_da_faixa_sao_aceitas(cliente, cadastro):
    cliente.logar(PCP)

    assert cliente.post("/api/demandas", json=demanda(prazo="2028-11-22")).status_code == 201
    assert cliente.post("/api/previsoes", json=previsao(data_chegada="2025-11-22")).status_code == 201


def test_data_absurda_tambem_no_patch(cliente, cadastro):
    cliente.logar(PCP)
    demanda_id = cliente.post("/api/demandas", json=demanda()).json()["id"]

    assert cliente.patch(f"/api/demandas/{demanda_id}", json={"prazo": "9999-01-01"}).status_code == 422


# --- M10: duplicidades ---


def test_bloqueio_sobreposto_no_mesmo_secador_e_recusado(cliente, cadastro):
    cliente.logar(PCP)
    assert cliente.post("/api/bloqueios", json=bloqueio()).status_code == 201

    sobreposto = cliente.post("/api/bloqueios", json=bloqueio(inicio="2026-12-02", fim="2026-12-05"))

    assert sobreposto.status_code == 409
    assert "já está bloqueado de 01/12/2026 a 02/12/2026" in sobreposto.json()["detail"]
    assert cadastro.query(BloqueioSecador).count() == 1


def test_bloqueio_vizinho_e_editar_o_proprio_sao_aceitos(cliente, cadastro):
    cliente.logar(PCP)
    primeiro = cliente.post("/api/bloqueios", json=bloqueio()).json()["id"]
    assert cliente.post("/api/bloqueios", json=bloqueio(inicio="2026-12-03", fim="2026-12-04")).status_code == 201

    # Esticar o próprio bloqueio não colide com ele mesmo; esticar até o vizinho colide
    assert cliente.patch(f"/api/bloqueios/{primeiro}", json={"motivo": "Outra descrição"}).status_code == 200
    assert cliente.patch(f"/api/bloqueios/{primeiro}", json={"fim": "2026-12-03"}).status_code == 409


def test_demanda_identica_pede_confirmacao(cliente, cadastro):
    cliente.logar(PCP)
    assert cliente.post("/api/demandas", json=demanda()).status_code == 201

    repetida = cliente.post("/api/demandas", json=demanda())
    confirmada = cliente.post("/api/demandas", params={"confirmar_duplicada": "true"}, json=demanda())

    assert repetida.status_code == 409
    assert "Já existe a demanda #1" in repetida.json()["detail"]
    assert confirmada.status_code == 201
    assert cadastro.query(Demanda).count() == 2


def test_demanda_com_prazo_diferente_nao_e_duplicada(cliente, cadastro):
    cliente.logar(PCP)
    cliente.post("/api/demandas", json=demanda())

    assert cliente.post("/api/demandas", json=demanda(prazo="2026-12-11")).status_code == 201


# --- M11: faixas sem sentido físico ---


def test_reserva_maior_que_a_demanda_e_recusada(cliente, cadastro):
    cliente.logar(PCP)

    criar = cliente.post("/api/demandas", json=demanda(kg="10", reserva_kg="50"))
    demanda_id = cliente.post("/api/demandas", json=demanda(kg="10", reserva_kg="10")).json()["id"]
    alterar = cliente.patch(f"/api/demandas/{demanda_id}", json={"kg": "5"})  # reserva 10 > kg 5

    assert criar.status_code == 422
    assert alterar.status_code == 422
    assert alterar.json()["detail"] == "A reserva não pode ser maior que a demanda"


@pytest.mark.parametrize(
    "campos", [{"setup_diario_h": "9999.99"}, {"setup_inicial_h": "24.01"}]
)
def test_setup_acima_de_24h_e_recusado(cliente, cadastro, campos):
    cliente.logar(ADMIN_CADASTRO)

    assert cliente.patch("/api/capacidades/1", json=campos).status_code == 422


def test_setup_dentro_do_regime_nao_passa_do_regime(cliente, cadastro):
    cliente.logar(ADMIN_CADASTRO)
    assert cliente.patch("/api/ervas/1", json={"regime_horas_dia": "12"}).status_code == 200

    setup_grande = cliente.patch("/api/capacidades/1", json={"setup_diario_h": "13"})
    fora_do_regime = cliente.patch(
        "/api/capacidades/1", json={"setup_diario_h": "13", "setup_dentro_do_regime": False}
    )

    assert setup_grande.status_code == 422
    assert "passa do regime da erva (12" in setup_grande.json()["detail"]
    assert fora_do_regime.status_code == 200  # fora do regime, só o teto de 24 h vale


def test_reduzir_o_regime_abaixo_de_um_setup_e_recusado(cliente, cadastro):
    cliente.logar(ADMIN_CADASTRO)
    assert cliente.patch("/api/capacidades/1", json={"setup_inicial_h": "5"}).status_code == 200

    assert cliente.patch("/api/ervas/1", json={"regime_horas_dia": "4"}).status_code == 422
    assert cliente.patch("/api/ervas/1", json={"regime_horas_dia": "5"}).status_code == 200


def test_regime_menor_que_1h_e_recusado(cliente, cadastro):
    cliente.logar(ADMIN_CADASTRO)

    assert cliente.patch("/api/ervas/1", json={"regime_horas_dia": "0.01"}).status_code == 422


# --- M12: inteiros sem teto ---


@pytest.mark.parametrize(
    ("rota", "metodo", "corpo", "usuario"),
    [
        ("/api/demandas", "post", demanda(prioridade=4294967296), PCP),
        ("/api/capacidades/1", "patch", {"prioridade": 4294967296}, ADMIN_CADASTRO),
        ("/api/ervas/1", "patch", {"espera_maxima_dias": 4294967296}, ADMIN_CADASTRO),
        ("/api/ervas/1", "patch", {"espera_maxima_dias": 366}, ADMIN_CADASTRO),
    ],
)
def test_inteiro_enorme_da_422_e_nao_500(cliente, cadastro, rota, metodo, corpo, usuario):
    cliente.logar(usuario)

    assert getattr(cliente, metodo)(rota, json=corpo).status_code == 422
