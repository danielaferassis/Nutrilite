"""Planos salvos: versão por horizonte, rastreabilidade, aprovação e escopo.

Usa as fixtures de tests/conftest.py (SQLite em memória, números sintéticos).
"""

from datetime import date
from decimal import Decimal

import pytest

from app.models import Capacidade, Demanda, Plano, StatusPlano
from tests.conftest import CONSULTA, FONTE_A, GESTOR, PCP, TODOS_OS_DIAS, demanda, lote

DEZEMBRO = {"inicio": "2026-12-01", "fim": "2026-12-07"}


def salvar(cliente, **campos):
    cliente.logar(PCP)
    corpo = {**DEZEMBRO, "dias_operacao": TODOS_OS_DIAS, **campos}
    return cliente.post("/api/planos", json=corpo)


def aprovar(cliente, plano_id):
    cliente.logar(GESTOR)
    return cliente.post(f"/api/planos/{plano_id}/aprovar")


@pytest.fixture
def cenario(cadastro):
    demanda(cadastro)
    lote(cadastro)
    return cadastro


# --- Salvar ---


def test_salvar_exige_permissao_de_simular(cliente, cenario):
    for usuario in (GESTOR, CONSULTA, FONTE_A):
        cliente.logar(usuario)
        corpo = {**DEZEMBRO, "dias_operacao": TODOS_OS_DIAS}
        assert cliente.post("/api/planos", json=corpo).status_code == 403


def test_salva_rascunho_com_resultado_e_parametros_usados(cliente, cenario):
    resposta = salvar(cliente, observacao="Primeira rodada")

    assert resposta.status_code == 201
    plano = resposta.json()
    assert plano["status"] == "rascunho"
    assert plano["versao"] == 1
    assert plano["viavel"] is True
    assert plano["criado_por"]["id"] == PCP
    assert plano["aprovado_por"] is None
    assert plano["observacao"] == "Primeira rodada"
    assert sum(a["kg_fresco"] for a in plano["alocacoes"]) == pytest.approx(800)
    assert plano["necessidades"][0]["kg_fresco"] == pytest.approx(625)
    assert plano["kpis"]["ocupacao_planejada_pct"]["SEC-1"] is not None
    assert plano["avisos"] == []
    # Rastreabilidade: a entrada inteira fica gravada
    parametros = plano["parametros"]
    assert parametros["dias_operacao"] == TODOS_OS_DIAS
    assert parametros["capacidades"][0]["kg_fresco_por_hora"] == 100
    assert parametros["demandas"][0]["kg"] == 100
    assert parametros["lotes"][0]["data_chegada"] == "2026-12-01"


def test_versao_conta_planos_do_mesmo_horizonte(cliente, cenario):
    assert salvar(cliente).json()["versao"] == 1
    assert salvar(cliente).json()["versao"] == 2
    assert salvar(cliente, fim="2026-12-08").json()["versao"] == 1


def test_plano_salvo_nao_muda_quando_o_cadastro_muda(cliente, cenario):
    plano_id = salvar(cliente).json()["id"]

    cenario.get(Capacidade, 1).kg_fresco_por_hora = Decimal(10)
    cenario.get(Demanda, 1).kg = Decimal(1)
    cenario.commit()

    plano = cliente.get(f"/api/planos/{plano_id}").json()
    assert plano["parametros"]["capacidades"][0]["kg_fresco_por_hora"] == 100
    assert plano["parametros"]["demandas"][0]["kg"] == 100
    assert plano["necessidades"][0]["kg_fresco"] == pytest.approx(625)


def test_plano_guarda_pendencias(cliente, cadastro):
    demanda(cadastro)  # sem oferta

    plano = salvar(cliente).json()

    assert plano["viavel"] is False
    assert sorted(p["tipo"] for p in plano["pendencias"]) == ["atraso", "saldo_nao_alocado"]


# --- Aprovar ---


def test_aprovar_registra_quem_e_quando(cliente, cenario):
    plano_id = salvar(cliente).json()["id"]

    resposta = aprovar(cliente, plano_id)

    assert resposta.status_code == 200
    plano = resposta.json()
    assert plano["status"] == "aprovado"
    assert plano["aprovado_por"]["id"] == GESTOR
    assert plano["aprovado_em"] is not None
    assert plano["criado_por"]["id"] == PCP


def test_aprovar_exige_permissao(cliente, cenario):
    plano_id = salvar(cliente).json()["id"]
    # PCP simula, mas aprovar é outra permissão
    assert cliente.post(f"/api/planos/{plano_id}/aprovar").status_code == 403


def test_nao_aprova_duas_vezes(cliente, cenario):
    plano_id = salvar(cliente).json()["id"]
    aprovar(cliente, plano_id)
    assert aprovar(cliente, plano_id).status_code == 409


def test_nao_aprova_plano_com_parametro_ausente(cliente, cenario):
    plano_id = salvar(cliente, dias_operacao=None).json()["id"]
    resposta = aprovar(cliente, plano_id)
    assert resposta.status_code == 409
    assert "parâmetros ausentes" in resposta.json()["detail"]


def test_aprova_plano_viavel_ou_com_atraso(cliente, cadastro):
    demanda(cadastro)  # sem oferta: atraso, mas o PCP pode aprovar ciente
    plano_id = salvar(cliente).json()["id"]
    assert aprovar(cliente, plano_id).status_code == 200


def test_aprovar_substitui_aprovado_sobreposto(cliente, cenario):
    v1 = salvar(cliente).json()["id"]
    aprovar(cliente, v1)
    v2 = salvar(cliente).json()["id"]
    janeiro = salvar(cliente, inicio="2027-01-01", fim="2027-01-07").json()["id"]
    aprovar(cliente, janeiro)

    aprovar(cliente, v2)

    status = {p.id: p.status for p in cenario.query(Plano).all()}
    assert status == {
        v1: StatusPlano.SUBSTITUIDO,
        v2: StatusPlano.APROVADO,
        janeiro: StatusPlano.APROVADO,  # horizonte não se sobrepõe
    }


# --- Consultar e remover ---


def test_consulta_nao_ve_rascunhos(cliente, cenario):
    rascunho = salvar(cliente).json()["id"]
    aprovado = salvar(cliente).json()["id"]
    aprovar(cliente, aprovado)

    cliente.logar(CONSULTA)
    assert [p["id"] for p in cliente.get("/api/planos").json()] == [aprovado]
    assert cliente.get(f"/api/planos/{rascunho}").status_code == 404
    assert cliente.get(f"/api/planos/{aprovado}").status_code == 200

    cliente.logar(PCP)
    assert {p["id"] for p in cliente.get("/api/planos").json()} == {rascunho, aprovado}


def test_lista_filtra_por_status_e_dia(cliente, cenario):
    dezembro = salvar(cliente).json()["id"]
    aprovar(cliente, dezembro)
    salvar(cliente, inicio="2027-01-01", fim="2027-01-07")

    cliente.logar(PCP)
    aprovados = cliente.get("/api/planos", params={"status": "aprovado"}).json()
    assert [p["id"] for p in aprovados] == [dezembro]
    no_dia = cliente.get("/api/planos", params={"dia": "2027-01-03"}).json()
    assert [p["inicio"] for p in no_dia] == ["2027-01-01"]
    # O resumo não carrega o cronograma inteiro
    assert "alocacoes" not in no_dia[0]


def test_remove_so_rascunho(cliente, cenario):
    rascunho = salvar(cliente).json()["id"]
    aprovado = salvar(cliente).json()["id"]
    aprovar(cliente, aprovado)

    cliente.logar(PCP)
    assert cliente.delete(f"/api/planos/{aprovado}").status_code == 409
    assert cliente.delete(f"/api/planos/{rascunho}").status_code == 204
    assert cliente.get(f"/api/planos/{rascunho}").status_code == 404


def test_alocacoes_saem_em_ordem_de_dia(cliente, cadastro):
    lote(cadastro, data_chegada=date(2026, 12, 3))
    lote(cadastro, data_chegada=date(2026, 12, 1))

    dias = [a["dia"] for a in salvar(cliente).json()["alocacoes"]]

    assert dias == sorted(dias)
