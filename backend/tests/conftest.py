"""Fixtures da API: SQLite em memória com usuários e permissões sintéticos.

`cadastro` deixa a erva A (id 1) pronta para simular no secador SEC-1:
1 kg moído = 1,25 kg desidratado = 6,25 kg fresco; secador de 100 kg/h.

A view `vw_permissao_usuario` vira uma tabela simples: o teste grava nela
quais funcionalidades cada usuário tem e o router faz a checagem real.
"""

from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.acesso import get_usuario_atual
from app.database import Base, get_db
from app.main import app
from app.models import (
    BloqueioSecador,
    Capacidade,
    Demanda,
    Erva,
    Estagio,
    ModoCapacidade,
    Origem,
    Plano,
    PlanoAlocacao,
    PlanoPendencia,
    PrevisaoOferta,
    Rendimento,
    Secador,
    Usuario,
)

# Usuários sintéticos e as funcionalidades de cada um
PCP = 1
FONTE_A = 2
FONTE_B = 3
CONSULTA = 4
SEM_PERMISSAO = 5
GESTOR = 6
TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6]
PERMISSOES = {
    PCP: [
        "demanda.consultar", "demanda.gerenciar", "previsao.gerenciar", "plano.simular",
        "bloqueio.consultar", "bloqueio.gerenciar",
    ],
    FONTE_A: ["previsao.propria"],
    FONTE_B: ["previsao.propria"],
    CONSULTA: [
        "demanda.consultar", "previsao.consultar", "plano.consultar", "bloqueio.consultar",
    ],
    SEM_PERMISSAO: [],
    GESTOR: ["plano.aprovar"],
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
                {"id": usuario_id, "nome": f"Usuário {usuario_id}", "email": f"u{usuario_id}@t"},
            )
            for codigo in codigos:
                conexao.execute(
                    text("INSERT INTO vw_permissao_usuario VALUES (:id, :codigo)"),
                    {"id": usuario_id, "codigo": codigo},
                )
    tabelas = [
        Erva.__table__, Secador.__table__, Capacidade.__table__, Rendimento.__table__,
        Demanda.__table__, PrevisaoOferta.__table__,
        Plano.__table__, PlanoAlocacao.__table__, PlanoPendencia.__table__,
        BloqueioSecador.__table__,
    ]
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


@pytest.fixture
def cadastro(db):
    erva = db.get(Erva, 1)
    erva.regime_horas_dia = Decimal(24)
    erva.espera_maxima_dias = 3
    db.add_all([
        Secador(id=1, codigo="SEC-1", nome="Secador sintético 1"),
        Rendimento(
            erva_id=1, fresco_por_desidratado=Decimal(5), desidratado_por_moido=Decimal("1.25")
        ),
        Capacidade(
            erva_id=1, secador_id=1, modo=ModoCapacidade.CONTINUO,
            kg_fresco_por_hora=Decimal(100), setup_inicial_h=Decimal(1),
            setup_final_h=Decimal(1), setup_diario_h=Decimal(0), setup_dentro_do_regime=True,
        ),
    ])
    db.commit()
    return db


def demanda(db, **campos):
    valores = {"erva_id": 1, "kg": Decimal(100), "estagio": Estagio.MOIDO,
               "prazo": date(2026, 12, 5), "criado_por_id": PCP, **campos}
    db.add(Demanda(**valores))
    db.commit()


def lote(db, **campos):
    valores = {"erva_id": 1, "origem": Origem.PROCOMPETE, "data_chegada": date(2026, 12, 1),
               "kg_fresco": Decimal(800), "criado_por_id": FONTE_A, **campos}
    db.add(PrevisaoOferta(**valores))
    db.commit()
