"""Indicadores da secagem: OEE (sem qualidade) e aderência ao plano.

Cadastro sintético do conftest: SEC-1 seca a erva 1 em modo contínuo a
100 kg/h. Números fictícios, conferidos à mão em cada teste.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app import calendario
from app.models import ApontamentoSecagem, Base, BloqueioSecador
from tests.conftest import CONSULTA, FONTE_A, GESTOR, PCP, TODOS_OS_DIAS, lote

DIA = date(2026, 12, 1)  # terça-feira
HOJE = date(2026, 12, 31)  # os dias dos testes já passaram (só conta até hoje)


@pytest.fixture(autouse=True)
def hoje_fixo(monkeypatch):
    monkeypatch.setattr(calendario, "hoje", lambda: HOJE)


@pytest.fixture
def banco(cadastro):
    Base.metadata.create_all(cadastro.get_bind(), tables=[ApontamentoSecagem.__table__])
    return cadastro


def carga(db, *, kg, minutos, inicio=7, dia=DIA, erva_id=1, secador_id=1):
    comeco = datetime(dia.year, dia.month, dia.day, inicio)
    db.add(ApontamentoSecagem(
        importacao_id=1, secador_id=secador_id, erva_id=erva_id, data=dia, inicio=comeco,
        fim=comeco + timedelta(minutes=minutos), duracao_min=Decimal(minutos),
        quantidade_kg=Decimal(kg), linha=2,
    ))
    db.commit()


def consultar(cliente, de=DIA, ate=DIA, usuario=CONSULTA):
    cliente.logar(usuario)
    return cliente.get("/api/indicadores/secagem", params={"de": str(de), "ate": str(ate)})


def test_disponibilidade_e_performance_sem_plano(cliente, banco):
    # 300 kg em 3h30 e 200 kg em 2h30: padrão (100 kg/h) = 3h + 2h = 5h; real = 6h
    carga(banco, kg=300, minutos=210)
    carga(banco, kg=200, minutos=150, inicio=11)

    corpo = consultar(cliente).json()

    (secador,) = corpo["secadores"]
    assert secador["secador"]["codigo"] == "SEC-1"
    assert (secador["horas_apontadas"], secador["horas_disponiveis"]) == (6.0, 24.0)
    assert secador["disponibilidade_pct"] == 25.0  # 6 h de 24 h
    assert secador["performance_pct"] == 83.3  # 5 h padrão em 6 h reais
    assert secador["oee_sem_qualidade_pct"] == 20.8  # 25,0 × 83,3
    # Sem refugo no Infinity e sem plano: nada é inventado
    assert (secador["qualidade_pct"], secador["oee_pct"], secador["aderencia_pct"]) == (None, None, None)
    assert corpo["total"]["disponibilidade_pct"] == 25.0
    assert "Nenhum plano aprovado no período: sem aderência ao plano" in corpo["avisos"]
    assert [(d["dia"], d["cargas"]) for d in corpo["dias"]] == [("2026-12-01", 2)]


def test_aderencia_ao_plano_aprovado(cliente, banco):
    lote(banco, data_chegada=DIA, kg_fresco=Decimal(800))
    cliente.logar(PCP)
    plano = cliente.post(
        "/api/planos", json={"inicio": str(DIA), "fim": str(DIA), "dias_operacao": TODOS_OS_DIAS}
    ).json()
    cliente.logar(GESTOR)
    cliente.post(f"/api/planos/{plano['id']}/aprovar")
    planejado = sum(float(a["kg_fresco"]) for a in plano["alocacoes"])
    assert planejado > 0
    carga(banco, kg=600, minutos=360)

    secador = consultar(cliente).json()["secadores"][0]

    (erva,) = secador["por_erva"]
    assert (erva["kg_planejado"], erva["kg_apontado"]) == (planejado, 600.0)
    assert secador["aderencia_pct"] == erva["aderencia_pct"] == round(100 * 600 / planejado, 1)
    horas_plano = sum(float(a["horas_secagem"]) + float(a["horas_setup"]) for a in plano["alocacoes"])
    assert secador["horas_planejadas"] == round(horas_plano, 2)


def test_dia_fora_da_operacao_do_plano_e_bloqueio_nao_contam_como_disponiveis(cliente, banco):
    # Plano de terça a quinta só opera às segundas: terça e quarta não estão disponíveis
    cliente.logar(PCP)
    plano = cliente.post(
        "/api/planos", json={"inicio": str(DIA), "fim": str(DIA + timedelta(days=2)), "dias_operacao": [0]}
    ).json()
    cliente.logar(GESTOR)
    cliente.post(f"/api/planos/{plano['id']}/aprovar")
    # Quinta (dia 3) está bloqueada; sexta (dia 4) não tem plano e conta
    banco.add(BloqueioSecador(
        secador_id=1, inicio=DIA + timedelta(days=2), fim=DIA + timedelta(days=2),
        motivo="Manutenção fictícia", criado_por_id=PCP,
    ))
    banco.commit()
    carga(banco, kg=100, minutos=60, dia=DIA + timedelta(days=3))

    secador = consultar(cliente, ate=DIA + timedelta(days=3)).json()["secadores"][0]

    assert secador["horas_disponiveis"] == 24.0  # só a sexta
    assert secador["disponibilidade_pct"] == round(100 * 1 / 24, 1)


def test_sem_disponibilidade_nem_cargas_tudo_nao_aplicavel(cliente, banco):
    banco.add(BloqueioSecador(secador_id=1, inicio=DIA, fim=DIA, motivo="Parada fictícia", criado_por_id=PCP))
    banco.commit()

    secador = consultar(cliente).json()["secadores"][0]

    assert secador["disponibilidade_pct"] is None
    assert secador["performance_pct"] is None
    assert secador["oee_sem_qualidade_pct"] is None


def test_carga_sem_tempo_padrao_fica_fora_da_performance(cliente, banco):
    carga(banco, kg=100, minutos=60)  # erva 1: tem capacidade
    carga(banco, kg=100, minutos=90, inicio=9, erva_id=2)  # erva 2: sem capacidade no SEC-1

    corpo = consultar(cliente).json()
    secador = corpo["secadores"][0]

    assert (secador["cargas"], secador["cargas_sem_padrao"]) == (2, 1)
    assert secador["performance_pct"] == 100.0  # só a carga da erva 1 (1 h em 1 h)
    assert secador["horas_apontadas"] == 2.5  # a disponibilidade conta as duas
    assert any("sem tempo padrão" in aviso for aviso in corpo["avisos"])


def test_exige_permissao_e_periodo_valido(cliente, banco):
    assert consultar(cliente, usuario=FONTE_A).status_code == 403
    assert consultar(cliente, de=DIA, ate=DIA - timedelta(days=1)).status_code == 422


# --- Aderência por erva (QA M4) e dias futuros (QA M5) ---


def aprovar_plano(cliente, banco, kg=800):
    lote(banco, data_chegada=DIA, kg_fresco=Decimal(kg))
    cliente.logar(PCP)
    plano = cliente.post(
        "/api/planos", json={"inicio": str(DIA), "fim": str(DIA), "dias_operacao": TODOS_OS_DIAS}
    ).json()
    cliente.logar(GESTOR)
    cliente.post(f"/api/planos/{plano['id']}/aprovar")
    return plano


def test_outra_erva_no_lugar_da_planejada_nao_cumpre_o_plano(cliente, banco):
    """O cenário do QA: planejado erva 1, apontado a mesma quantidade da erva 2 → era 100%."""
    plano = aprovar_plano(cliente, banco)
    planejado = sum(float(a["kg_fresco"]) for a in plano["alocacoes"])
    carga(banco, kg=planejado, minutos=360, erva_id=2)

    secador = consultar(cliente).json()["secadores"][0]

    assert secador["aderencia_pct"] == 0.0
    assert [(e["erva"], e["kg_planejado"], e["kg_apontado"], e["aderencia_pct"]) for e in secador["por_erva"]] == [
        ("ERVA-A", planejado, 0.0, 0.0),
        ("ERVA-B", 0.0, planejado, None),  # nada planejado: não aplicável
    ]


def test_secar_a_mais_nao_passa_de_100(cliente, banco):
    plano = aprovar_plano(cliente, banco)
    planejado = sum(float(a["kg_fresco"]) for a in plano["alocacoes"])
    carga(banco, kg=planejado * 2, minutos=600)

    corpo = consultar(cliente).json()

    assert corpo["total"]["aderencia_pct"] == 100.0
    assert corpo["total"]["por_erva"][0]["kg_apontado"] == planejado * 2


def test_dias_futuros_nao_contam(cliente, banco, monkeypatch):
    """O cenário do QA: período de 7 dias consultado no 1º dia → disponibilidade de 1 dia só."""
    monkeypatch.setattr(calendario, "hoje", lambda: DIA)
    carga(banco, kg=600, minutos=360)

    corpo = consultar(cliente, ate=DIA + timedelta(days=6)).json()

    secador = corpo["secadores"][0]
    assert secador["horas_disponiveis"] == 24.0
    assert secador["disponibilidade_pct"] == 25.0
    assert "Os dias depois de hoje (01/12/2026) não entram nos indicadores" in corpo["avisos"]


def test_plano_de_dia_futuro_nao_conta_na_aderencia(cliente, banco, monkeypatch):
    aprovar_plano(cliente, banco)
    monkeypatch.setattr(calendario, "hoje", lambda: DIA - timedelta(days=1))

    corpo = consultar(cliente, de=DIA - timedelta(days=1), ate=DIA).json()

    assert corpo["total"]["horas_planejadas"] == 0
    assert corpo["total"]["aderencia_pct"] is None


def test_periodo_todo_no_futuro_fica_sem_dado(cliente, banco, monkeypatch):
    monkeypatch.setattr(calendario, "hoje", lambda: DIA - timedelta(days=1))

    corpo = consultar(cliente).json()

    assert corpo["total"]["horas_disponiveis"] == 0
    assert corpo["total"]["disponibilidade_pct"] is None
    assert corpo["dias"] == []


def test_sem_apontamentos_disponibilidade_fica_sem_dado_e_nao_zero(cliente, banco):
    corpo = consultar(cliente).json()

    assert corpo["secadores"][0]["horas_disponiveis"] == 24.0
    assert corpo["secadores"][0]["disponibilidade_pct"] is None
    assert corpo["total"]["disponibilidade_pct"] is None
    assert any(a.startswith("Nenhum apontamento do Infinity no período") for a in corpo["avisos"])
