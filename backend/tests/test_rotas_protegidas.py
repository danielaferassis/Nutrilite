"""Varredura de todas as rotas da API (QA, 17/11/2026).

Em vez de lembrar de testar cada router novo, estes testes percorrem as rotas
registradas no app e exigem duas regras do CLAUDE.md ("autorização sempre
verificada no backend"):

1. Sem sessão, toda rota responde 401, menos as públicas.
2. Toda rota que altera dados (POST, PATCH, PUT, DELETE) depende de uma
   permissão específica (`requer_permissao` / `requer_alguma_permissao`), não
   só de estar logado. Foi assim que a rota de exemplo `/api/items`, aberta a
   qualquer perfil, apareceu no relatório de QA.

Rota nova que precise de exceção entra nas listas abaixo, com o motivo.
"""

import re

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app

PUBLICAS = {
    ("GET", "/api/health"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/logout"),  # sem sessão é só um no-op
}
# Alteram dados só do próprio usuário logado
SO_COM_LOGIN = {
    ("POST", "/api/auth/senha"),
}
ALTERAM = {"POST", "PATCH", "PUT", "DELETE"}


def _achatar(rotas_do_router, prefixo: str = ""):
    """APIRoutes com o caminho completo. FastAPI antigo copia as rotas no
    include_router; o 0.16x guarda o router incluído (`original_router`)."""
    for rota in rotas_do_router:
        if isinstance(rota, APIRoute):
            yield prefixo + rota.path, rota
        elif hasattr(rota, "original_router"):
            contexto = getattr(rota, "include_context", None)
            yield from _achatar(rota.original_router.routes, prefixo + getattr(contexto, "prefix", ""))


def rotas() -> list[tuple[str, str, APIRoute]]:
    return sorted(
        ((metodo, caminho, rota)
         for caminho, rota in _achatar(app.routes)
         if caminho.startswith("/api")
         for metodo in rota.methods),
        key=lambda r: r[:2],
    )


def exige_permissao(dependant) -> bool:
    for dependencia in dependant.dependencies:
        nome = getattr(dependencia.call, "__qualname__", "")
        if nome.startswith(("requer_permissao.", "requer_alguma_permissao.")):
            return True
        if exige_permissao(dependencia):
            return True
    return False


def test_a_varredura_encontra_as_rotas():
    # Guarda contra a varredura passar vazia por mudança no FastAPI
    assert len(rotas()) > 50


@pytest.mark.parametrize(
    ("metodo", "caminho"),
    [(m, c) for m, c, _ in rotas() if (m, c) not in PUBLICAS],
)
def test_sem_sessao_responde_401(db, metodo, caminho):
    app.dependency_overrides[get_db] = lambda: db
    try:
        cliente = TestClient(app)
        url = re.sub(r"\{[^}]+\}", "1", caminho)
        resposta = cliente.request(metodo, url, json={})
    finally:
        app.dependency_overrides.clear()

    assert resposta.status_code == 401, f"{metodo} {caminho} respondeu {resposta.status_code}"


@pytest.mark.parametrize(
    ("metodo", "caminho", "rota"),
    [r for r in rotas() if r[0] in ALTERAM and r[:2] not in PUBLICAS | SO_COM_LOGIN],
    ids=lambda valor: valor if isinstance(valor, str) else "",
)
def test_rota_que_altera_dados_exige_permissao(metodo, caminho, rota):
    assert exige_permissao(rota.dependant), (
        f"{metodo} {caminho} só exige login: use requer_permissao(...) ou explique a exceção"
    )
