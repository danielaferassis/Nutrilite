"""POST /api/simulacoes: do cadastro no banco até o resultado do motor.

Usa as fixtures de tests/conftest.py (SQLite em memória). Números sintéticos:
1 kg moído = 1,25 kg desidratado = 6,25 kg fresco; secador de 100 kg/h.
"""

from datetime import date
from decimal import Decimal

import pytest

from app.models import (
    Capacidade,
    Demanda,
    Erva,
    Estagio,
    ModoCapacidade,
    Origem,
    PrevisaoOferta,
    Rendimento,
    Secador,
)
from app.simulacao import montar_entrada
from tests.conftest import FONTE_A, PCP

TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6]


@pytest.fixture
def cadastro(db):
    """Erva A (id 1) pronta para simular no secador SEC-1."""
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


def simular(cliente, **campos):
    cliente.logar(PCP)
    corpo = {"inicio": "2026-12-01", "fim": "2026-12-07", "dias_operacao": TODOS_OS_DIAS, **campos}
    return cliente.post("/api/simulacoes", json=corpo)


def tipos(resposta):
    return [p["tipo"] for p in resposta.json()["pendencias"]]


# --- Permissão e validação do pedido ---


def test_simulacao_exige_permissao(cliente):
    cliente.logar(FONTE_A)
    corpo = {"inicio": "2026-12-01", "fim": "2026-12-07", "dias_operacao": TODOS_OS_DIAS}
    assert cliente.post("/api/simulacoes", json=corpo).status_code == 403


@pytest.mark.parametrize(
    "campos",
    [
        {"fim": "2026-11-30"},  # antes do início
        {"fim": "2027-12-31"},  # horizonte longo demais
        {"dias_operacao": [7]},  # fora de 0–6
    ],
)
def test_simulacao_rejeita_pedido_invalido(cliente, campos):
    assert simular(cliente, **campos).status_code == 422


# --- Do banco ao motor ---


def test_simulacao_viavel_cobre_a_demanda(cliente, cadastro):
    demanda(cadastro)
    lote(cadastro)

    resposta = simular(cliente)

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["viavel"] is True
    assert corpo["pendencias"] == []
    assert corpo["necessidades"][0]["kg_fresco"] == pytest.approx(625)
    alocacoes = corpo["alocacoes"]
    assert sum(a["kg_fresco"] for a in alocacoes) == pytest.approx(800)
    assert sum(a["kg_fresco"] for a in alocacoes if a["demanda_id"] == "1") == pytest.approx(625)
    assert {a["secador"] for a in alocacoes} == {"SEC-1"}
    assert corpo["kpis"]["ocupacao_planejada_pct"]["SEC-1"] is not None
    # Sem tabela de bloqueios a simulação avisa que supõe secadores livres
    assert corpo["avisos"]


def test_dias_de_operacao_omitidos_viram_pendencia(cliente, cadastro):
    demanda(cadastro)
    lote(cadastro)

    resposta = simular(cliente, dias_operacao=None)

    assert resposta.json()["viavel"] is False
    assert tipos(resposta) == ["param_ausente"]
    assert resposta.json()["dias_operacao"] is None


def test_parametro_de_capacidade_ausente_vira_pendencia(cliente, cadastro):
    cadastro.get(Capacidade, 1).kg_fresco_por_hora = None
    cadastro.commit()
    lote(cadastro)

    resposta = simular(cliente)

    pendencia = resposta.json()["pendencias"][0]
    assert pendencia["tipo"] == "param_ausente"
    assert pendencia["secador"] == "SEC-1"


def test_demanda_sem_oferta_gera_atraso_e_saldo(cliente, cadastro):
    demanda(cadastro)

    resposta = simular(cliente)

    assert sorted(tipos(resposta)) == ["atraso", "saldo_nao_alocado"]
    assert resposta.json()["kpis"]["saldo_nao_alocado_kg"]["ERVA-A"] == pytest.approx(625)


def test_demanda_fora_do_horizonte_nao_entra(cliente, cadastro):
    demanda(cadastro, prazo=date(2026, 12, 20))
    demanda(cadastro, prazo=date(2026, 11, 20))

    resposta = simular(cliente)

    assert resposta.json()["necessidades"] == []
    assert resposta.json()["viavel"] is True


def test_secador_inativo_nao_recebe_erva(cliente, cadastro):
    cadastro.add(Secador(id=2, codigo="SEC-2", nome="Secador sintético 2", ativo=False))
    cadastro.add(Capacidade(
        erva_id=1, secador_id=2, modo=ModoCapacidade.CONTINUO,
        kg_fresco_por_hora=Decimal(500), setup_inicial_h=Decimal(0),
        setup_final_h=Decimal(0), setup_diario_h=Decimal(0), setup_dentro_do_regime=True,
        prioridade=1,
    ))
    cadastro.commit()
    lote(cadastro)

    resposta = simular(cliente)

    assert {a["secador"] for a in resposta.json()["alocacoes"]} == {"SEC-1"}
    assert "SEC-2" not in resposta.json()["kpis"]["horas_disponiveis"]


def test_demanda_de_erva_inativa_vira_pendencia_e_nao_some(cliente, cadastro):
    demanda(cadastro, erva_id=3)

    resposta = simular(cliente)

    assert tipos(resposta) == ["param_ausente"]
    assert resposta.json()["pendencias"][0]["erva"] == "ERVA-INATIVA"


def test_entrada_inclui_lote_que_ainda_espera_no_inicio(cadastro):
    lote(cadastro, data_chegada=date(2026, 11, 28))  # espera 3 dias: vence em 01/12
    lote(cadastro, data_chegada=date(2026, 11, 20))  # já venceu
    lote(cadastro, data_chegada=date(2026, 12, 9))  # chega depois do fim

    entrada = montar_entrada(
        cadastro, date(2026, 12, 1), date(2026, 12, 7), frozenset(TODOS_OS_DIAS)
    )

    assert [lote.data_chegada for lote in entrada.lotes] == [date(2026, 11, 28)]
    assert entrada.bloqueios == []
