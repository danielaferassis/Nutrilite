"""Grupos: quem pode listar e quem pode alterar.

Usa as fixtures de tests/conftest.py (SQLite em memória, dados sintéticos).
"""

import pytest
from sqlalchemy import text

from app.models import Funcionalidade, GrupoFuncionalidade
from tests.conftest import PCP, SEM_PERMISSAO

GESTOR_USUARIOS = 101
GESTOR_GRUPOS = 102


@pytest.fixture
def com_grupos(db):
    conexao = db.connection()
    # grupo tem DEFAULT ... ON UPDATE do MySQL, que o SQLite não entende
    conexao.execute(text(
        "CREATE TABLE grupo (id INTEGER PRIMARY KEY, nome TEXT, descricao TEXT, ativo BOOLEAN,"
        " criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,"
        " atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP)"
    ))
    Funcionalidade.__table__.create(conexao)
    GrupoFuncionalidade.__table__.create(conexao)
    conexao.execute(text("INSERT INTO grupo (id, nome, ativo) VALUES (1, 'Grupo sintético', 1)"))
    for usuario_id, codigo in [
        (GESTOR_USUARIOS, "usuario.gerenciar"),
        (GESTOR_GRUPOS, "grupo.gerenciar"),
    ]:
        conexao.execute(
            text("INSERT INTO usuario VALUES (:id, 'Gestor', :email, 'x', 1, NULL,"
                 " CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"),
            {"id": usuario_id, "email": f"u{usuario_id}@t"},
        )
        conexao.execute(
            text("INSERT INTO vw_permissao_usuario VALUES (:id, :codigo)"),
            {"id": usuario_id, "codigo": codigo},
        )
    db.commit()
    return db


@pytest.mark.parametrize("usuario_id", [GESTOR_USUARIOS, GESTOR_GRUPOS])
def test_lista_grupos_para_quem_gerencia_usuarios_ou_grupos(cliente, com_grupos, usuario_id):
    # Quem gerencia usuários precisa da lista para vincular os grupos
    cliente.logar(usuario_id)
    resposta = cliente.get("/api/grupos")

    assert resposta.status_code == 200
    assert [g["nome"] for g in resposta.json()] == ["Grupo sintético"]


@pytest.mark.parametrize("usuario_id", [PCP, SEM_PERMISSAO])
def test_lista_grupos_exige_permissao(cliente, com_grupos, usuario_id):
    cliente.logar(usuario_id)
    assert cliente.get("/api/grupos").status_code == 403


def test_so_quem_gerencia_grupos_altera_grupos(cliente, com_grupos):
    cliente.logar(GESTOR_USUARIOS)
    assert cliente.post("/api/grupos", json={"nome": "Novo"}).status_code == 403
    assert cliente.patch("/api/grupos/1", json={"nome": "Outro"}).status_code == 403
    assert cliente.delete("/api/grupos/1").status_code == 403
    assert cliente.get("/api/funcionalidades").status_code == 403
