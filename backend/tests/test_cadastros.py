"""Listagem de ervas e secadores para os selects das telas, e dados fictícios."""

from datetime import date, datetime, timezone

import pytest

from app import dados_ficticios
from app.models import Demanda, Erva, Secador, Usuario
from tests.conftest import FONTE_A, PCP, TODOS_OS_DIAS


def test_lista_ervas_ativas_por_nome(cliente):
    cliente.logar(FONTE_A)
    nomes = [e["nome"] for e in cliente.get("/api/ervas").json()]
    assert nomes == ["Erva sintética A", "Erva sintética B"]


def test_lista_ervas_inclusive_inativas(cliente):
    cliente.logar(FONTE_A)
    codigos = {e["codigo"] for e in cliente.get("/api/ervas", params={"ativos": False}).json()}
    assert "ERVA-INATIVA" in codigos


def test_lista_secadores_ativos(cliente, db):
    db.add_all([
        Secador(id=1, codigo="SEC-2", nome="Secador 2"),
        Secador(id=2, codigo="SEC-1", nome="Secador 1"),
        Secador(id=3, codigo="SEC-0", nome="Parado", ativo=False),
    ])
    db.commit()
    cliente.logar(FONTE_A)
    assert [s["codigo"] for s in cliente.get("/api/secadores").json()] == ["SEC-1", "SEC-2"]


def test_lista_capacidades_com_campos_ausentes_como_nulo(cliente, cadastro):
    cliente.logar(FONTE_A)
    [capacidade] = cliente.get("/api/capacidades").json()
    assert capacidade["erva_id"] == 1
    assert float(capacidade["kg_fresco_por_hora"]) == 100
    assert capacidade["prioridade"] is None


def test_dados_ficticios_recusam_banco_com_cadastro(db):
    with pytest.raises(dados_ficticios.BancoJaTemCadastro):
        dados_ficticios.carregar(db, db.get(Usuario, PCP))
    assert db.query(Secador).count() == 0


def test_dados_ficticios_simulam_e_mostram_pendencias(cliente, db):
    db.query(Erva).delete()
    db.commit()

    dados_ficticios.carregar(db, db.get(Usuario, PCP), hoje=date(2026, 12, 1))

    cliente.logar(PCP)
    corpo = cliente.post("/api/simulacoes", json={
        "inicio": "2026-12-01", "fim": "2026-12-14", "dias_operacao": TODOS_OS_DIAS,
    }).json()
    tipos = {p["tipo"] for p in corpo["pendencias"]}
    assert "capacidade_excedida" in tipos
    assert "param_ausente" not in tipos
    secadores_por_erva = {}
    for a in corpo["alocacoes"]:
        secadores_por_erva.setdefault(a["erva"], set()).add(a["secador"])
    # Prioridade cadastrada (picão no SCB01) e maior vazão (salsa no SCB03)
    assert secadores_por_erva["PICAO"] == {"SCB01"}
    assert secadores_por_erva["SALSA"] == {"SCB03"}


def test_dados_ficticios_usam_a_data_da_fazenda(db, monkeypatch):
    class Relogio(datetime):
        @classmethod
        def now(cls, tz=None):
            # 01/11 às 23h30 em Ubajara = 02/11 em UTC
            return datetime(2026, 11, 2, 2, 30, tzinfo=timezone.utc).astimezone(tz)

    monkeypatch.setattr(dados_ficticios, "datetime", Relogio)
    db.query(Erva).delete()
    db.commit()

    dados_ficticios.carregar(db, db.get(Usuario, PCP))

    demandas = db.query(Demanda).all()
    assert min(d.prazo for d in demandas) == date(2026, 11, 6)  # hoje (01/11) + 5
