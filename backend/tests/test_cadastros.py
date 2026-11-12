"""Listagem de ervas e secadores para os selects das telas, e dados fictícios."""

from datetime import date, datetime, timezone

import pytest

from app import calendario, dados_ficticios
from app.models import Demanda, Erva, Secador, Usuario
from tests.conftest import ADMIN_CADASTRO, FONTE_A, PCP, TODOS_OS_DIAS, demanda, lote


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
    secador_da_salsa = {}
    for a in corpo["alocacoes"]:
        secadores_por_erva.setdefault(a["erva"], set()).add(a["secador"])
        if a["erva"] == "SALSA":
            secador_da_salsa[a["dia"]] = a["secador"]
    # Prioridade cadastrada: picão sempre no SCB01
    assert secadores_por_erva["PICAO"] == {"SCB01"}
    # Salsa prefere o SCB03 (maior capacidade); no dia 03 ele está na campanha
    # de camomila, então a salsa vai para o SCB02
    assert secador_da_salsa == {"2026-12-03": "SCB02", "2026-12-09": "SCB03"}

    # Troca no mesmo dia: o lote único de fibra termina e outra erva entra
    ervas_no_dia = {}
    for a in corpo["alocacoes"]:
        do_dia = ervas_no_dia.setdefault((a["dia"], a["secador"]), [])
        if a["erva"] not in do_dia:
            do_dia.append(a["erva"])
    assert ["FIBRA", "CAMOMILA"] in ervas_no_dia.values()


def test_dados_ficticios_usam_a_data_da_fazenda(db, monkeypatch):
    class Relogio(datetime):
        @classmethod
        def now(cls, tz=None):
            # 01/11 às 23h30 em Ubajara = 02/11 em UTC
            return datetime(2026, 11, 2, 2, 30, tzinfo=timezone.utc).astimezone(tz)

    monkeypatch.setattr(calendario, "datetime", Relogio)
    db.query(Erva).delete()
    db.commit()

    dados_ficticios.carregar(db, db.get(Usuario, PCP))

    demandas = db.query(Demanda).all()
    assert min(d.prazo for d in demandas) == date(2026, 11, 6)  # hoje (01/11) + 5


def test_dados_ficticios_trazem_historico_de_chegadas(cliente, db, monkeypatch):
    monkeypatch.setattr(calendario, "hoje", lambda: date(2026, 12, 1))
    db.query(Erva).delete()
    db.commit()
    dados_ficticios.carregar(db, db.get(Usuario, PCP), hoje=date(2026, 12, 1))

    cliente.logar(PCP)
    chegadas = cliente.get(
        "/api/cronograma", params={"de": "2026-11-01", "ate": "2026-11-30"}
    ).json()["chegadas"]

    situacoes = sorted(c["situacao"] for c in chegadas)
    assert situacoes == ["atrasada", "nao_prevista", "recebida", "recebida", "recebida"]
    desvios = sorted(float(c["desvio_kg"]) for c in chegadas if c["desvio_kg"] is not None)
    assert desvios == [-80, 0, 10]


# --- Escrita do cadastro (cadastro.gerenciar) ---

CAPACIDADE_POR_CARGA = {
    "erva_id": 2, "secador_id": 1, "modo": "por_carga", "kg_por_carga": "150",
    "horas_por_carga": "5", "setup_inicial_h": "2", "setup_final_h": "3",
    "setup_diario_h": "1.5", "setup_dentro_do_regime": True,
}


def test_escrita_do_cadastro_exige_permissao(cliente, cadastro):
    cliente.logar(PCP)
    assert cliente.post("/api/ervas", json={"codigo": "x", "nome": "X"}).status_code == 403
    assert cliente.patch("/api/secadores/1", json={"nome": "Y"}).status_code == 403
    assert cliente.post("/api/capacidades", json=CAPACIDADE_POR_CARGA).status_code == 403
    assert cliente.delete("/api/capacidades/1").status_code == 403
    assert cliente.patch("/api/rendimentos/1", json={"fresco_por_desidratado": "6"}).status_code == 403
    # Leitura continua aberta a quem está logado
    assert cliente.get("/api/rendimentos").status_code == 200


def test_cria_erva_com_codigo_canonico_e_parametros_ausentes(cliente, db):
    cliente.logar(ADMIN_CADASTRO)
    resposta = cliente.post("/api/ervas", json={"codigo": " erva-c ", "nome": " Erva C "})

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert (corpo["codigo"], corpo["nome"]) == ("ERVA-C", "Erva C")
    # Não informado fica nulo: nada de valor padrão
    assert corpo["regime_horas_dia"] is None
    assert corpo["espera_maxima_dias"] is None


def test_codigo_repetido_responde_409(cliente, cadastro):
    cliente.logar(ADMIN_CADASTRO)
    assert cliente.post("/api/ervas", json={"codigo": "erva-a", "nome": "Outra"}).status_code == 409
    assert cliente.patch("/api/ervas/2", json={"codigo": "ERVA-A"}).status_code == 409
    # Manter o próprio código não é conflito
    assert cliente.patch("/api/ervas/1", json={"codigo": "ERVA-A"}).status_code == 200
    assert cliente.post("/api/secadores", json={"codigo": "sec-1", "nome": "Outro"}).status_code == 409


def test_atualiza_erva_e_limpa_parametro_com_null(cliente, cadastro):
    cliente.logar(ADMIN_CADASTRO)
    resposta = cliente.patch("/api/ervas/1", json={"regime_horas_dia": None, "ativo": False})

    assert resposta.status_code == 200
    assert resposta.json()["regime_horas_dia"] is None
    assert resposta.json()["ativo"] is False
    # Campo obrigatório não aceita null
    assert cliente.patch("/api/ervas/1", json={"nome": None}).status_code == 422
    assert cliente.patch("/api/ervas/1", json={"regime_horas_dia": "25"}).status_code == 422


def test_desativar_erva_tira_ela_da_lista_padrao(cliente, cadastro):
    cliente.logar(ADMIN_CADASTRO)
    cliente.patch("/api/ervas/1", json={"ativo": False})

    assert "ERVA-A" not in {e["codigo"] for e in cliente.get("/api/ervas").json()}
    assert "ERVA-A" in {e["codigo"] for e in cliente.get("/api/ervas", params={"ativos": False}).json()}


def test_cria_secador_e_capacidade_por_carga(cliente, cadastro):
    cliente.logar(ADMIN_CADASTRO)
    secador = cliente.post("/api/secadores", json={"codigo": "sec-2", "nome": "Secador 2"})
    assert secador.status_code == 201
    assert secador.json()["codigo"] == "SEC-2"

    resposta = cliente.post("/api/capacidades", json={**CAPACIDADE_POR_CARGA, "secador_id": secador.json()["id"]})

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["modo"] == "por_carga"
    assert float(corpo["setup_diario_h"]) == 1.5
    assert corpo["prioridade"] is None


def test_capacidade_repetida_ou_referencia_invalida(cliente, cadastro):
    cliente.logar(ADMIN_CADASTRO)
    repetida = {**CAPACIDADE_POR_CARGA, "erva_id": 1}
    assert cliente.post("/api/capacidades", json=repetida).status_code == 409
    assert cliente.post("/api/capacidades", json={**CAPACIDADE_POR_CARGA, "secador_id": 99}).status_code == 422
    assert cliente.post("/api/capacidades", json={**CAPACIDADE_POR_CARGA, "erva_id": 99}).status_code == 422


@pytest.mark.parametrize("campo, valor", [
    ("setup_inicial_h", "1.234"),   # coluna tem 2 casas: não arredondar calado
    ("kg_por_carga", "0"),
    ("setup_final_h", "-1"),
    ("prioridade", -1),
])
def test_capacidade_recusa_valor_invalido(cliente, cadastro, campo, valor):
    cliente.logar(ADMIN_CADASTRO)
    assert cliente.post("/api/capacidades", json={**CAPACIDADE_POR_CARGA, campo: valor}).status_code == 422


def test_atualiza_e_remove_capacidade(cliente, cadastro):
    cliente.logar(ADMIN_CADASTRO)
    resposta = cliente.patch("/api/capacidades/1", json={"prioridade": 1, "setup_diario_h": None})
    assert resposta.status_code == 200
    assert resposta.json()["prioridade"] == 1
    assert resposta.json()["setup_diario_h"] is None
    # O par erva × secador não muda pelo PATCH
    cliente.patch("/api/capacidades/1", json={"erva_id": 2})
    assert cliente.get("/api/capacidades").json()[0]["erva_id"] == 1

    assert cliente.delete("/api/capacidades/1").status_code == 204
    assert cliente.get("/api/capacidades").json() == []
    assert cliente.delete("/api/capacidades/1").status_code == 404


def test_parametro_limpo_vira_pendencia_na_simulacao(cliente, cadastro):
    demanda(cadastro)
    lote(cadastro)
    cliente.logar(ADMIN_CADASTRO)
    cliente.patch("/api/capacidades/1", json={"setup_diario_h": None})

    cliente.logar(PCP)
    corpo = cliente.post("/api/simulacoes", json={
        "inicio": "2026-12-01", "fim": "2026-12-07", "dias_operacao": TODOS_OS_DIAS,
    }).json()
    ausentes = [p for p in corpo["pendencias"] if p["tipo"] == "param_ausente"]
    assert any("setup_diario_h" in p["mensagem"] for p in ausentes)


def test_rendimento_um_por_erva(cliente, cadastro):
    cliente.logar(ADMIN_CADASTRO)
    assert cliente.post("/api/rendimentos", json={"erva_id": 1, "fresco_por_desidratado": "4"}).status_code == 409
    assert cliente.post("/api/rendimentos", json={"erva_id": 99}).status_code == 422

    novo = cliente.post("/api/rendimentos", json={"erva_id": 2, "fresco_por_desidratado": "6.5"})
    assert novo.status_code == 201
    assert novo.json()["desidratado_por_moido"] is None

    rendimento_id = novo.json()["id"]
    resposta = cliente.patch(f"/api/rendimentos/{rendimento_id}", json={"desidratado_por_moido": "1.1"})
    assert float(resposta.json()["desidratado_por_moido"]) == 1.1
    assert {r["erva_id"] for r in cliente.get("/api/rendimentos").json()} == {1, 2}
