"""Proteções da gestão de acesso (QA, 17/11/2026).

1. Ninguém concede uma permissão que não tem: quem só gerencia usuários não se
   põe (nem põe um usuário novo) no grupo Administrador; quem só gerencia
   grupos não dá a um grupo funcionalidades que não tem.
2. O sistema nunca fica sem administrador (usuário ativo com gestão de
   usuários e de grupos): tirar o próprio grupo, esvaziar, desativar ou excluir
   o grupo admin e desativar ou excluir o último admin dão 409.

Usa as fixtures de tests/conftest.py (SQLite em memória, dados sintéticos).
A view de permissões é uma tabela no teste: `sincronizar_view` a recalcula a
partir dos grupos, como a view do MySQL faria.
"""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app.acesso import get_sessao_atual
from app.main import app
from app.models import (
    Demanda,
    Estagio,
    Funcionalidade,
    Grupo,
    GrupoFuncionalidade,
    Sessao,
    Usuario,
    UsuarioGrupo,
)

USUARIOS, GRUPOS, APROVAR = 1, 2, 3  # ids das funcionalidades
ADMINISTRADOR, GESTAO_USUARIOS, GESTAO_GRUPOS, INATIVO = 10, 11, 12, 13  # ids dos grupos
ADMIN, GESTOR_USUARIOS, GESTOR_GRUPOS, OUTRO_ADMIN = 201, 202, 203, 204  # ids dos usuários


def sincronizar_view(db) -> None:
    conexao = db.connection()
    conexao.execute(text("DELETE FROM vw_permissao_usuario"))
    conexao.execute(text(
        "INSERT INTO vw_permissao_usuario SELECT DISTINCT u.id, f.codigo FROM usuario u"
        " JOIN usuario_grupo ug ON ug.usuario_id = u.id"
        " JOIN grupo g ON g.id = ug.grupo_id AND g.ativo = 1"
        " JOIN grupo_funcionalidade gf ON gf.grupo_id = g.id"
        " JOIN funcionalidade f ON f.id = gf.funcionalidade_id AND f.ativo = 1"
        " WHERE u.ativo = 1"
    ))
    db.commit()


@pytest.fixture
def acesso(db, cliente):
    conexao = db.connection()
    # grupo tem DEFAULT ... ON UPDATE do MySQL, que o SQLite não entende
    conexao.execute(text(
        "CREATE TABLE grupo (id INTEGER PRIMARY KEY, nome TEXT, descricao TEXT, ativo BOOLEAN,"
        " criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,"
        " atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP)"
    ))
    for tabela in (Funcionalidade, GrupoFuncionalidade, UsuarioGrupo, Sessao):
        tabela.__table__.create(conexao)
    db.commit()

    funcionalidades = {
        USUARIOS: "usuario.gerenciar", GRUPOS: "grupo.gerenciar", APROVAR: "plano.aprovar",
    }
    for id, codigo in funcionalidades.items():
        db.add(Funcionalidade(id=id, codigo=codigo, nome=codigo, ativo=True))
    grupos = {
        ADMINISTRADOR: ("Administrador", [USUARIOS, GRUPOS, APROVAR], True),
        GESTAO_USUARIOS: ("Gestão de usuários", [USUARIOS], True),
        GESTAO_GRUPOS: ("Gestão de grupos", [GRUPOS], True),
        INATIVO: ("Aprovadores antigos", [APROVAR], False),
    }
    for id, (nome, _, ativo) in grupos.items():
        db.add(Grupo(id=id, nome=nome, ativo=ativo))
    db.flush()
    for id, (_, ids, _) in grupos.items():
        db.get(Grupo, id).funcionalidades = [db.get(Funcionalidade, f) for f in ids]
    for id, grupo in [
        (ADMIN, ADMINISTRADOR), (GESTOR_USUARIOS, GESTAO_USUARIOS),
        (GESTOR_GRUPOS, GESTAO_GRUPOS), (OUTRO_ADMIN, None),
    ]:
        db.add(Usuario(id=id, nome=f"Usuário {id}", email=f"u{id}@t", senha_hash="x", ativo=True))
        db.flush()
        if grupo:
            db.get(Usuario, id).grupos = [db.get(Grupo, grupo)]
    db.commit()
    sincronizar_view(db)
    # PATCH de usuário pede a sessão atual (para não derrubar quem troca a própria senha)
    app.dependency_overrides[get_sessao_atual] = lambda: SimpleNamespace(id=0)
    return db


def grupos_de(db, usuario_id) -> set[int]:
    db.expire_all()
    return {g.id for g in db.get(Usuario, usuario_id).grupos}


def tornar_admin(db, usuario_id) -> None:
    db.get(Usuario, usuario_id).grupos = [db.get(Grupo, ADMINISTRADOR)]
    db.commit()
    sincronizar_view(db)


# --- 1. Não conceder o que não tem ---


def test_gestor_de_usuarios_nao_se_poe_no_grupo_administrador(cliente, acesso):
    cliente.logar(GESTOR_USUARIOS)

    resposta = cliente.patch(
        f"/api/usuarios/{GESTOR_USUARIOS}", json={"grupo_ids": [GESTAO_USUARIOS, ADMINISTRADOR]}
    )

    assert resposta.status_code == 403
    assert "grupo.gerenciar" in resposta.json()["detail"]
    assert grupos_de(acesso, GESTOR_USUARIOS) == {GESTAO_USUARIOS}


def test_gestor_de_usuarios_nao_cria_usuario_administrador(cliente, acesso):
    cliente.logar(GESTOR_USUARIOS)
    corpo = {"nome": "Novo", "email": "novo@exemplo.com", "senha": "senha-segura-1"}

    negado = cliente.post("/api/usuarios", json={**corpo, "grupo_ids": [ADMINISTRADOR]})
    permitido = cliente.post("/api/usuarios", json={**corpo, "grupo_ids": [GESTAO_USUARIOS]})

    assert negado.status_code == 403
    assert permitido.status_code == 201


def test_manter_grupo_que_o_usuario_ja_tinha_nao_conta_como_concessao(cliente, acesso):
    tornar_admin(acesso, OUTRO_ADMIN)
    cliente.logar(GESTOR_USUARIOS)

    resposta = cliente.patch(
        f"/api/usuarios/{OUTRO_ADMIN}", json={"nome": "Renomeado", "grupo_ids": [ADMINISTRADOR]}
    )

    assert resposta.status_code == 200


def test_gestor_de_grupos_nao_da_ao_grupo_o_que_nao_tem(cliente, acesso):
    cliente.logar(GESTOR_GRUPOS)

    proprio = cliente.patch(
        f"/api/grupos/{GESTAO_GRUPOS}", json={"funcionalidade_ids": [GRUPOS, USUARIOS]}
    )
    novo = cliente.post("/api/grupos", json={"nome": "Aprovação", "funcionalidade_ids": [APROVAR]})
    reativar = cliente.patch(f"/api/grupos/{INATIVO}", json={"ativo": True})
    permitido = cliente.post("/api/grupos", json={"nome": "Grupos 2", "funcionalidade_ids": [GRUPOS]})

    assert (proprio.status_code, novo.status_code, reativar.status_code) == (403, 403, 403)
    assert permitido.status_code == 201


# --- 2. Sempre resta um administrador ---


@pytest.mark.parametrize(
    "requisicao",
    [
        ("patch", f"/api/grupos/{ADMINISTRADOR}", {"funcionalidade_ids": [APROVAR]}),
        ("patch", f"/api/grupos/{ADMINISTRADOR}", {"ativo": False}),
        ("delete", f"/api/grupos/{ADMINISTRADOR}", None),
        ("patch", f"/api/usuarios/{ADMIN}", {"grupo_ids": []}),
    ],
    ids=["esvaziar-grupo", "desativar-grupo", "excluir-grupo", "tirar-o-proprio-grupo"],
)
def test_ultimo_administrador_nao_pode_ser_removido(cliente, acesso, requisicao):
    metodo, url, corpo = requisicao
    cliente.logar(ADMIN)

    resposta = getattr(cliente, metodo)(url, **({"json": corpo} if corpo else {}))

    assert resposta.status_code == 409
    assert "sem nenhum administrador" in resposta.json()["detail"]
    acesso.expire_all()
    grupo = acesso.get(Grupo, ADMINISTRADOR)
    assert grupo is not None and grupo.ativo
    assert {f.id for f in grupo.funcionalidades} == {USUARIOS, GRUPOS, APROVAR}
    assert grupos_de(acesso, ADMIN) == {ADMINISTRADOR}


def test_com_outro_administrador_a_alteracao_passa(cliente, acesso):
    tornar_admin(acesso, OUTRO_ADMIN)
    cliente.logar(ADMIN)

    assert cliente.patch(f"/api/usuarios/{ADMIN}", json={"grupo_ids": []}).status_code == 200


def test_desativar_ou_excluir_o_ultimo_outro_administrador(cliente, acesso):
    # O ADMIN perde o grupo para OUTRO_ADMIN e GESTOR_USUARIOS tenta derrubá-lo
    tornar_admin(acesso, OUTRO_ADMIN)
    acesso.get(Usuario, ADMIN).grupos = [acesso.get(Grupo, GESTAO_USUARIOS)]
    acesso.commit()
    sincronizar_view(acesso)
    cliente.logar(GESTOR_USUARIOS)

    desativar = cliente.patch(f"/api/usuarios/{OUTRO_ADMIN}", json={"ativo": False})
    excluir = cliente.delete(f"/api/usuarios/{OUTRO_ADMIN}")

    assert (desativar.status_code, excluir.status_code) == (409, 409)
    acesso.expire_all()
    assert acesso.get(Usuario, OUTRO_ADMIN).ativo


def test_administrador_pode_vir_de_dois_grupos(cliente, acesso):
    # Gestão de usuários + gestão de grupos em grupos separados também é administrador
    acesso.get(Usuario, OUTRO_ADMIN).grupos = [
        acesso.get(Grupo, GESTAO_USUARIOS), acesso.get(Grupo, GESTAO_GRUPOS)
    ]
    acesso.commit()
    sincronizar_view(acesso)
    cliente.logar(ADMIN)

    assert cliente.patch(f"/api/usuarios/{ADMIN}", json={"grupo_ids": []}).status_code == 200


# --- Excluir usuário com histórico ---


def test_excluir_usuario_com_registros_pede_para_desativar(cliente, acesso):
    acesso.execute(text("PRAGMA foreign_keys = ON"))
    acesso.add(Demanda(
        erva_id=1, kg=Decimal(10), estagio=Estagio.MOIDO, prazo=date(2026, 12, 5),
        criado_por_id=GESTOR_GRUPOS,
    ))
    acesso.commit()
    cliente.logar(ADMIN)

    resposta = cliente.delete(f"/api/usuarios/{GESTOR_GRUPOS}")

    assert resposta.status_code == 409
    assert "Desative" in resposta.json()["detail"]
    acesso.expire_all()
    assert acesso.get(Usuario, GESTOR_GRUPOS) is not None
