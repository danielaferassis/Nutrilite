"""Fixtures da API: SQLite em memória com usuários e permissões sintéticos.

A view `vw_permissao_usuario` vira uma tabela simples: o teste grava nela
quais funcionalidades cada usuário tem e o router faz a checagem real.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.acesso import get_usuario_atual
from app.database import Base, get_db
from app.main import app
from app.models import (
    Capacidade,
    Demanda,
    Erva,
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
PERMISSOES = {
    PCP: [
        "demanda.consultar", "demanda.gerenciar", "previsao.gerenciar", "plano.simular",
    ],
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
