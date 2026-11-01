"""Bloqueios de secador: cadastro e efeito na simulação.

Usa as fixtures de tests/conftest.py (SQLite em memória, números sintéticos).
"""

from datetime import date

import pytest

from app.models import BloqueioSecador, Secador
from tests.conftest import CONSULTA, FONTE_A, PCP, TODOS_OS_DIAS, lote


def novo_bloqueio(**campos):
    return {"secador_id": 1, "inicio": "2026-12-01", "fim": "2026-12-02",
            "motivo": "Manutenção preventiva", **campos}


@pytest.fixture
def com_secador(db):
    db.add(Secador(id=1, codigo="SEC-1", nome="Secador sintético 1"))
    db.commit()
    return db


def test_bloqueio_exige_permissao(cliente, com_secador):
    cliente.logar(FONTE_A)
    assert cliente.get("/api/bloqueios").status_code == 403
    cliente.logar(CONSULTA)
    assert cliente.get("/api/bloqueios").status_code == 200
    assert cliente.post("/api/bloqueios", json=novo_bloqueio()).status_code == 403


def test_cadastra_bloqueio(cliente, com_secador):
    cliente.logar(PCP)
    resposta = cliente.post("/api/bloqueios", json=novo_bloqueio(motivo="  Feriado  "))

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["secador"]["codigo"] == "SEC-1"
    assert corpo["motivo"] == "Feriado"
    assert corpo["criado_por"]["id"] == PCP


@pytest.mark.parametrize(
    "campos",
    [{"fim": "2026-11-30"}, {"motivo": "   "}, {"secador_id": 99}, {"inicio": None}],
)
def test_bloqueio_rejeita_valores_invalidos(cliente, com_secador, campos):
    cliente.logar(PCP)
    assert cliente.post("/api/bloqueios", json=novo_bloqueio(**campos)).status_code == 422


def test_atualizacao_valida_periodo_com_o_que_ja_existe(cliente, com_secador):
    cliente.logar(PCP)
    bloqueio_id = cliente.post("/api/bloqueios", json=novo_bloqueio()).json()["id"]

    # Só o fim veio, mas ele fica antes do início gravado
    resposta = cliente.patch(f"/api/bloqueios/{bloqueio_id}", json={"fim": "2026-11-20"})
    assert resposta.status_code == 422

    resposta = cliente.patch(f"/api/bloqueios/{bloqueio_id}", json={"fim": "2026-12-05"})
    assert resposta.json()["fim"] == "2026-12-05"


def test_lista_bloqueios_que_tocam_o_periodo(cliente, com_secador):
    cliente.logar(PCP)
    cliente.post("/api/bloqueios", json=novo_bloqueio(inicio="2026-11-25", fim="2026-11-30"))
    cliente.post("/api/bloqueios", json=novo_bloqueio(inicio="2026-12-05", fim="2026-12-06"))
    cliente.post("/api/bloqueios", json=novo_bloqueio(inicio="2026-12-20", fim="2026-12-21"))

    resposta = cliente.get("/api/bloqueios", params={"de": "2026-11-30", "ate": "2026-12-10"})

    assert [b["inicio"] for b in resposta.json()] == ["2026-11-25", "2026-12-05"]


def test_remove_bloqueio(cliente, com_secador):
    cliente.logar(PCP)
    bloqueio_id = cliente.post("/api/bloqueios", json=novo_bloqueio()).json()["id"]
    assert cliente.delete(f"/api/bloqueios/{bloqueio_id}").status_code == 204
    assert cliente.get(f"/api/bloqueios/{bloqueio_id}").status_code == 404


def test_simulacao_nao_aloca_no_secador_bloqueado(cliente, cadastro):
    lote(cadastro)  # chega 01/12, espera até 04/12
    cadastro.add(BloqueioSecador(
        secador_id=1, inicio=date(2026, 12, 1), fim=date(2026, 12, 2),
        motivo="Manutenção", criado_por_id=PCP,
    ))
    cadastro.commit()

    cliente.logar(PCP)
    corpo = cliente.post("/api/simulacoes", json={
        "inicio": "2026-12-01", "fim": "2026-12-07", "dias_operacao": TODOS_OS_DIAS,
    }).json()

    dias = {a["dia"] for a in corpo["alocacoes"]}
    assert dias and min(dias) == "2026-12-03"
    # 5 dias livres de 7: o denominador da ocupação desconta o bloqueio
    assert corpo["kpis"]["horas_disponiveis"]["SEC-1"] == 24 * 5


def test_plano_grava_os_bloqueios_usados(cliente, cadastro):
    lote(cadastro)
    cadastro.add(BloqueioSecador(
        secador_id=1, inicio=date(2026, 12, 6), fim=date(2026, 12, 6),
        motivo="Feriado", criado_por_id=PCP,
    ))
    cadastro.commit()

    cliente.logar(PCP)
    plano = cliente.post("/api/planos", json={
        "inicio": "2026-12-01", "fim": "2026-12-07", "dias_operacao": TODOS_OS_DIAS,
    }).json()

    assert plano["parametros"]["bloqueios"] == [
        {"secador": "SEC-1", "inicio": "2026-12-06", "fim": "2026-12-06", "motivo": "Feriado"}
    ]
