"""Vigência dos planos aprovados: em cada dia vale o aprovado mais recente.

Um plano novo só tira de vigor os dias que ele cobre. O anterior vira
`substituido` quando não sobra nenhum dia em que ele valha.

Usa as fixtures de tests/conftest.py (SQLite em memória, números sintéticos).
"""

from datetime import date, datetime

import pytest

from app.models import Plano, StatusPlano
from app.vigencia import trechos_vigentes, vigente_por_dia
from tests.conftest import CONSULTA, GESTOR, PCP, TODOS_OS_DIAS, lote


def dez(dia: int) -> date:
    return date(2026, 12, dia)


# --- Regra pura (app/vigencia.py) ---


def plano(id_: int, inicio: int, fim: int, aprovado_as: int | None, status=StatusPlano.APROVADO):
    return Plano(
        id=id_,
        versao=1,
        status=status,
        inicio=dez(inicio),
        fim=dez(fim),
        aprovado_em=None if aprovado_as is None else datetime(2026, 11, 1, aprovado_as),
    )


def test_mais_recente_vence_so_nos_dias_que_cobre():
    antigo = plano(1, 1, 7, aprovado_as=8)
    novo = plano(2, 5, 10, aprovado_as=9)

    vigentes = vigente_por_dia([novo, antigo], dez(1), dez(10))

    assert {d.day: p.id for d, p in vigentes.items()} == {
        **{d: 1 for d in range(1, 5)},
        **{d: 2 for d in range(5, 11)},
    }


def test_vale_a_ordem_de_aprovacao_e_nao_a_de_criacao():
    criado_antes_aprovado_depois = plano(1, 1, 7, aprovado_as=10)
    criado_depois_aprovado_antes = plano(2, 1, 7, aprovado_as=9)

    vigentes = vigente_por_dia(
        [criado_antes_aprovado_depois, criado_depois_aprovado_antes], dez(1), dez(7)
    )

    assert {p.id for p in vigentes.values()} == {1}


def test_ignora_rascunho_e_substituido():
    aprovado = plano(1, 1, 3, aprovado_as=8)
    rascunho = plano(2, 1, 3, aprovado_as=None, status=StatusPlano.RASCUNHO)
    substituido = plano(3, 1, 3, aprovado_as=9, status=StatusPlano.SUBSTITUIDO)

    vigentes = vigente_por_dia([aprovado, rascunho, substituido], dez(1), dez(3))

    assert {p.id for p in vigentes.values()} == {1}


def test_mais_recente_informado_vence_mesmo_sem_status_e_horario():
    # O plano sendo aprovado ainda é rascunho na hora do cálculo
    aprovado = plano(1, 1, 7, aprovado_as=23)
    sendo_aprovado = plano(2, 3, 4, aprovado_as=None, status=StatusPlano.RASCUNHO)

    vigentes = vigente_por_dia([aprovado], dez(1), dez(7), mais_recente=sendo_aprovado)

    assert vigentes[dez(3)].id == 2 and vigentes[dez(5)].id == 1


def test_trechos_agrupam_dias_seguidos_e_respeitam_o_periodo():
    antigo = plano(1, 1, 10, aprovado_as=8)
    meio = plano(2, 4, 6, aprovado_as=9)

    trechos = trechos_vigentes([antigo, meio], dez(2), dez(8))

    assert [(t.plano.id, t.inicio.day, t.fim.day) for t in trechos] == [
        (1, 2, 3), (2, 4, 6), (1, 7, 8),
    ]


# --- Aprovação e cronograma pela API ---


@pytest.fixture
def oferta_diaria(cadastro):
    # Um lote por dia: todo dia tem alocação, em qualquer plano
    for dia in range(1, 21):
        lote(cadastro, data_chegada=dez(dia), kg_fresco=500)
    return cadastro


def salvar(cliente, inicio: int, fim: int) -> int:
    cliente.logar(PCP)
    corpo = {"inicio": str(dez(inicio)), "fim": str(dez(fim)), "dias_operacao": TODOS_OS_DIAS}
    resposta = cliente.post("/api/planos", json=corpo)
    assert resposta.status_code == 201
    return resposta.json()["id"]


def aprovar(cliente, plano_id: int):
    cliente.logar(GESTOR)
    resposta = cliente.post(f"/api/planos/{plano_id}/aprovar")
    assert resposta.status_code == 200
    return resposta


def status(db) -> dict[int, StatusPlano]:
    db.expire_all()
    return {p.id: p.status for p in db.query(Plano).all()}


def cronograma(cliente, de: int, ate: int) -> dict:
    cliente.logar(CONSULTA)
    resposta = cliente.get("/api/cronograma", params={"de": str(dez(de)), "ate": str(dez(ate))})
    assert resposta.status_code == 200
    return resposta.json()


def test_sobreposicao_parcial_mantem_o_anterior_nos_outros_dias(cliente, oferta_diaria):
    antigo = salvar(cliente, 1, 14)
    aprovar(cliente, antigo)
    novo = salvar(cliente, 8, 21)

    aprovar(cliente, novo)

    assert status(oferta_diaria) == {antigo: StatusPlano.APROVADO, novo: StatusPlano.APROVADO}
    resposta = cronograma(cliente, 1, 21)
    assert [(t["plano_id"], t["inicio"], t["fim"]) for t in resposta["vigencia"]] == [
        (antigo, "2026-12-01", "2026-12-07"),
        (novo, "2026-12-08", "2026-12-21"),
    ]
    # Os dias 1 a 7 continuam com o plano antigo; do 8 em diante, só o novo
    por_dia = {}
    for a in resposta["alocacoes"]:
        por_dia.setdefault(a["dia"], set()).add(a["plano_id"])
    assert all(ids == {antigo} for dia, ids in por_dia.items() if dia < "2026-12-08")
    assert all(ids == {novo} for dia, ids in por_dia.items() if dia >= "2026-12-08")
    assert "2026-12-01" in por_dia and "2026-12-08" in por_dia


def test_plano_dentro_de_outro_divide_o_anterior_em_dois_trechos(cliente, oferta_diaria):
    antigo = salvar(cliente, 1, 10)
    aprovar(cliente, antigo)
    meio = salvar(cliente, 4, 6)

    aprovar(cliente, meio)

    assert status(oferta_diaria)[antigo] == StatusPlano.APROVADO
    trechos = cronograma(cliente, 1, 10)["vigencia"]
    assert [(t["plano_id"], t["inicio"][-2:], t["fim"][-2:]) for t in trechos] == [
        (antigo, "01", "03"), (meio, "04", "06"), (antigo, "07", "10"),
    ]


def test_substitui_quando_nenhum_dia_do_anterior_continua_valendo(cliente, oferta_diaria):
    # Nenhum dos dois novos cobre o antigo sozinho; juntos, cobrem todos os dias
    antigo = salvar(cliente, 3, 6)
    aprovar(cliente, antigo)
    comeco = salvar(cliente, 1, 4)
    aprovar(cliente, comeco)
    assert status(oferta_diaria)[antigo] == StatusPlano.APROVADO

    fim = salvar(cliente, 5, 8)
    aprovar(cliente, fim)

    assert status(oferta_diaria) == {
        antigo: StatusPlano.SUBSTITUIDO,
        comeco: StatusPlano.APROVADO,
        fim: StatusPlano.APROVADO,
    }


def test_mesmo_horizonte_continua_substituindo_por_inteiro(cliente, oferta_diaria):
    v1 = salvar(cliente, 1, 7)
    aprovar(cliente, v1)
    v2 = salvar(cliente, 1, 7)

    aprovar(cliente, v2)

    assert status(oferta_diaria) == {v1: StatusPlano.SUBSTITUIDO, v2: StatusPlano.APROVADO}
    assert {a["plano_id"] for a in cronograma(cliente, 1, 7)["alocacoes"]} == {v2}


def test_vigente_do_dia_e_o_aprovado_mais_recente(cliente, oferta_diaria):
    # Criado primeiro, aprovado por último: é ele que vale
    criado_antes = salvar(cliente, 1, 10)
    criado_depois = salvar(cliente, 5, 14)
    aprovar(cliente, criado_depois)
    aprovar(cliente, criado_antes)

    cliente.logar(CONSULTA)
    lista = cliente.get(
        "/api/planos", params={"status": "aprovado", "dia": "2026-12-07"}
    ).json()

    assert [p["id"] for p in lista] == [criado_antes, criado_depois]
