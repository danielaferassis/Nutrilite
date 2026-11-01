"""API de demandas e previsões de oferta, incluindo o escopo por permissão.

Usa SQLite em memória, isolado do MySQL. Os números são sintéticos.
A view `vw_permissao_usuario` vira uma tabela simples: o teste grava nela
quais funcionalidades cada usuário tem e o router faz a checagem real.
"""

import importlib.util
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.acesso import get_usuario_atual
from app.database import Base, get_db
from app.main import app
from app.models import Demanda, Erva, Estagio, Origem, PrevisaoOferta, Usuario
from app.planner.types import Estagio as EstagioPlanner
from app.planner.types import Origem as OrigemPlanner

MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "versions"
    / "20261101_2254_1711dd75ad70_cria_tabelas_de_demanda_e_previsao.py"
)

# Usuários sintéticos e as funcionalidades de cada um
PCP = 1
FONTE_A = 2
FONTE_B = 3
CONSULTA = 4
SEM_PERMISSAO = 5
PERMISSOES = {
    PCP: ["demanda.consultar", "demanda.gerenciar", "previsao.gerenciar"],
    FONTE_A: ["previsao.propria"],
    FONTE_B: ["previsao.propria"],
    CONSULTA: ["demanda.consultar", "previsao.consultar"],
    SEM_PERMISSAO: [],
}


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    with engine.begin() as conexao:
        # usuario tem DEFAULT ... ON UPDATE do MySQL, que o SQLite não entende
        conexao.execute(text(
            "CREATE TABLE usuario (id INTEGER PRIMARY KEY, nome TEXT, email TEXT,"
            " senha_hash TEXT, ativo BOOLEAN, ultimo_login DATETIME,"
            " criado_em DATETIME, atualizado_em DATETIME)"
        ))
        conexao.execute(text(
            "CREATE TABLE vw_permissao_usuario (usuario_id INTEGER, funcionalidade_codigo TEXT)"
        ))
        for usuario_id, codigos in PERMISSOES.items():
            conexao.execute(
                text("INSERT INTO usuario VALUES (:id, :nome, :email, 'x', 1, NULL,"
                     " CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"),
                {"id": usuario_id, "nome": f"Usuário {usuario_id}", "email": f"u{usuario_id}@teste"},
            )
            for codigo in codigos:
                conexao.execute(
                    text("INSERT INTO vw_permissao_usuario VALUES (:id, :codigo)"),
                    {"id": usuario_id, "codigo": codigo},
                )
    tabelas = [Erva.__table__, Demanda.__table__, PrevisaoOferta.__table__]
    Base.metadata.create_all(engine, tables=tabelas)
    sessao = sessionmaker(bind=engine, autoflush=False)()
    sessao.add_all([
        Erva(id=1, codigo="ERVA-A", nome="Erva sintética A"),
        Erva(id=2, codigo="ERVA-B", nome="Erva sintética B"),
        Erva(id=3, codigo="ERVA-INATIVA", nome="Erva inativa", ativo=False),
    ])
    sessao.commit()
    try:
        yield sessao
    finally:
        sessao.close()
        engine.dispose()


@pytest.fixture
def cliente(db):
    """Cliente HTTP; `cliente.logar(id)` troca o usuário logado."""
    usuario_atual = {"id": None}
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_usuario_atual] = lambda: db.get(Usuario, usuario_atual["id"])
    client = TestClient(app)
    client.logar = lambda usuario_id: usuario_atual.update(id=usuario_id)
    yield client
    app.dependency_overrides.clear()


def nova_demanda(**campos):
    return {"erva_id": 1, "kg": "100", "estagio": "moido", "prazo": "2026-12-10", **campos}


def nova_previsao(**campos):
    return {
        "erva_id": 1, "origem": "procompete", "data_chegada": "2026-12-01",
        "kg_fresco": "500", **campos,
    }


# --- Modelo e migration ---


def test_enums_repetem_os_valores_do_motor():
    assert {e.value for e in Estagio} == {e.value for e in EstagioPlanner}
    assert {o.value for o in Origem} == {o.value for o in OrigemPlanner}


def test_migration_e_incremental_sobre_o_cadastro():
    spec = importlib.util.spec_from_file_location("migration_demanda", MIGRATION)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)

    assert modulo.down_revision == "c4d8f1a6b2e0"
    codigos = {codigo for codigo, _, _ in modulo.FUNCIONALIDADES}
    # Toda permissão checada nos routers precisa ser cadastrada pela migration
    assert codigos == {
        "demanda.consultar", "demanda.gerenciar",
        "previsao.consultar", "previsao.gerenciar", "previsao.propria",
    }


# --- Demandas ---


def test_demanda_exige_permissao(cliente):
    cliente.logar(SEM_PERMISSAO)
    assert cliente.get("/api/demandas").status_code == 403
    assert cliente.post("/api/demandas", json=nova_demanda()).status_code == 403


def test_consulta_ve_demandas_mas_nao_cadastra(cliente):
    cliente.logar(CONSULTA)
    assert cliente.get("/api/demandas").status_code == 200
    assert cliente.post("/api/demandas", json=nova_demanda()).status_code == 403


def test_pcp_cadastra_demanda_com_rastreio_e_padroes(cliente):
    cliente.logar(PCP)
    resposta = cliente.post("/api/demandas", json=nova_demanda())

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["erva"] == {"id": 1, "codigo": "ERVA-A", "nome": "Erva sintética A"}
    assert corpo["criado_por"]["id"] == PCP
    assert corpo["estagio"] == "moido"
    assert float(corpo["kg"]) == 100
    assert float(corpo["reserva_kg"]) == 0
    assert corpo["prioridade"] == 0


@pytest.mark.parametrize("erva_id", [3, 99])
def test_demanda_rejeita_erva_inativa_ou_inexistente(cliente, erva_id):
    cliente.logar(PCP)
    resposta = cliente.post("/api/demandas", json=nova_demanda(erva_id=erva_id))
    assert resposta.status_code == 422


@pytest.mark.parametrize(
    "campos",
    [
        {"kg": "0"},
        {"kg": "1.0001"},  # mais casas que a coluna guarda
        {"reserva_kg": "-1"},
        {"estagio": "torrado"},
        {"prazo": None},
    ],
)
def test_demanda_rejeita_valores_invalidos(cliente, campos):
    cliente.logar(PCP)
    assert cliente.post("/api/demandas", json=nova_demanda(**campos)).status_code == 422


def test_lista_demandas_na_ordem_do_motor_e_filtra(cliente):
    cliente.logar(PCP)
    cliente.post("/api/demandas", json=nova_demanda(prazo="2026-12-20", prioridade=0))
    cliente.post("/api/demandas", json=nova_demanda(prazo="2026-12-10", prioridade=1))
    cliente.post("/api/demandas", json=nova_demanda(prazo="2026-12-10", prioridade=5))
    cliente.post("/api/demandas", json=nova_demanda(erva_id=2, prazo="2026-12-05"))

    todas = cliente.get("/api/demandas").json()
    assert [(d["prazo"], d["prioridade"]) for d in todas] == [
        ("2026-12-05", 0), ("2026-12-10", 5), ("2026-12-10", 1), ("2026-12-20", 0),
    ]

    filtradas = cliente.get(
        "/api/demandas", params={"erva_id": 1, "prazo_de": "2026-12-10", "prazo_ate": "2026-12-15"}
    ).json()
    assert [d["prioridade"] for d in filtradas] == [5, 1]


def test_atualiza_demanda_parcialmente(cliente):
    cliente.logar(PCP)
    demanda_id = cliente.post("/api/demandas", json=nova_demanda()).json()["id"]

    resposta = cliente.patch(f"/api/demandas/{demanda_id}", json={"prioridade": 3})

    assert resposta.status_code == 200
    assert resposta.json()["prioridade"] == 3
    assert float(resposta.json()["kg"]) == 100


def test_atualizacao_nao_aceita_nulo_em_campo_obrigatorio(cliente):
    cliente.logar(PCP)
    demanda_id = cliente.post("/api/demandas", json=nova_demanda()).json()["id"]
    assert cliente.patch(f"/api/demandas/{demanda_id}", json={"kg": None}).status_code == 422


def test_remove_demanda(cliente):
    cliente.logar(PCP)
    demanda_id = cliente.post("/api/demandas", json=nova_demanda()).json()["id"]

    assert cliente.delete(f"/api/demandas/{demanda_id}").status_code == 204
    assert cliente.get(f"/api/demandas/{demanda_id}").status_code == 404


# --- Previsões ---


def test_previsao_exige_permissao(cliente):
    cliente.logar(SEM_PERMISSAO)
    assert cliente.get("/api/previsoes").status_code == 403
    assert cliente.post("/api/previsoes", json=nova_previsao()).status_code == 403


def test_fonte_ve_e_altera_so_as_proprias_previsoes(cliente):
    cliente.logar(FONTE_A)
    da_fonte_a = cliente.post("/api/previsoes", json=nova_previsao()).json()["id"]
    cliente.logar(FONTE_B)
    da_fonte_b = cliente.post("/api/previsoes", json=nova_previsao(origem="pd")).json()["id"]

    lista = cliente.get("/api/previsoes").json()
    assert [p["id"] for p in lista] == [da_fonte_b]
    # A previsão de outra fonte nem aparece: 404, não 403
    assert cliente.get(f"/api/previsoes/{da_fonte_a}").status_code == 404
    assert cliente.patch(f"/api/previsoes/{da_fonte_a}", json={"kg_fresco": "1"}).status_code == 404
    assert cliente.delete(f"/api/previsoes/{da_fonte_a}").status_code == 404

    resposta = cliente.patch(f"/api/previsoes/{da_fonte_b}", json={"kg_fresco": "650"})
    assert resposta.status_code == 200
    assert float(resposta.json()["kg_fresco"]) == 650


def test_consulta_ve_todas_mas_nao_altera(cliente):
    cliente.logar(FONTE_A)
    previsao_id = cliente.post("/api/previsoes", json=nova_previsao()).json()["id"]

    cliente.logar(CONSULTA)
    assert [p["id"] for p in cliente.get("/api/previsoes").json()] == [previsao_id]
    assert cliente.post("/api/previsoes", json=nova_previsao()).status_code == 403
    assert cliente.patch(f"/api/previsoes/{previsao_id}", json={"kg_fresco": "1"}).status_code == 403


def test_quem_consulta_e_tem_proprias_nao_altera_as_dos_outros(cliente, db):
    db.execute(text("INSERT INTO vw_permissao_usuario VALUES (:id, 'previsao.consultar')"),
               {"id": FONTE_B})
    db.commit()
    cliente.logar(FONTE_A)
    previsao_id = cliente.post("/api/previsoes", json=nova_previsao()).json()["id"]

    cliente.logar(FONTE_B)
    assert cliente.get(f"/api/previsoes/{previsao_id}").status_code == 200
    resposta = cliente.delete(f"/api/previsoes/{previsao_id}")
    assert resposta.status_code == 403


def test_pcp_altera_e_remove_previsao_de_qualquer_fonte(cliente):
    cliente.logar(FONTE_A)
    previsao_id = cliente.post("/api/previsoes", json=nova_previsao()).json()["id"]

    cliente.logar(PCP)
    resposta = cliente.patch(f"/api/previsoes/{previsao_id}", json={"data_chegada": "2026-12-03"})
    assert resposta.status_code == 200
    assert resposta.json()["data_chegada"] == "2026-12-03"
    # O dono continua sendo quem cadastrou
    assert resposta.json()["criado_por"]["id"] == FONTE_A
    assert cliente.delete(f"/api/previsoes/{previsao_id}").status_code == 204


def test_lista_previsoes_por_chegada_e_filtra(cliente):
    cliente.logar(PCP)
    cliente.post("/api/previsoes", json=nova_previsao(data_chegada="2026-12-08"))
    cliente.post("/api/previsoes", json=nova_previsao(data_chegada="2026-12-02", origem="pd"))
    cliente.post("/api/previsoes", json=nova_previsao(data_chegada="2026-12-05", erva_id=2))

    todas = cliente.get("/api/previsoes").json()
    assert [p["data_chegada"] for p in todas] == ["2026-12-02", "2026-12-05", "2026-12-08"]

    assert len(cliente.get("/api/previsoes", params={"origem": "pd"}).json()) == 1
    assert len(cliente.get("/api/previsoes", params={"erva_id": 2}).json()) == 1
    janela = cliente.get(
        "/api/previsoes", params={"chegada_de": "2026-12-03", "chegada_ate": "2026-12-08"}
    ).json()
    assert [p["data_chegada"] for p in janela] == ["2026-12-05", "2026-12-08"]


@pytest.mark.parametrize(
    "campos", [{"kg_fresco": "0"}, {"origem": "vizinho"}, {"erva_id": 3}]
)
def test_previsao_rejeita_valores_invalidos(cliente, campos):
    cliente.logar(FONTE_A)
    assert cliente.post("/api/previsoes", json=nova_previsao(**campos)).status_code == 422


def test_previsao_guarda_a_data_de_chegada(cliente, db):
    cliente.logar(FONTE_A)
    previsao_id = cliente.post("/api/previsoes", json=nova_previsao()).json()["id"]
    assert db.get(PrevisaoOferta, previsao_id).data_chegada == date(2026, 12, 1)
