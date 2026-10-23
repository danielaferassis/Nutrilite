"""Persistência e schemas do cadastro de secagem.

Usa SQLite em memória, isolado do MySQL. Os números são sintéticos.
"""

import importlib.util
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.cadastro import para_capacidade, para_erva, para_rendimento, para_secador
from app.database import Base
from app.models import (
    Capacidade,
    Erva,
    Item,
    ModoCapacidade,
    Rendimento,
    Secador,
    Usuario,
)
from app.planner.types import ModoCapacidade as ModoPlanner
from app.schemas import (
    CapacidadeCreate,
    CapacidadeRead,
    ErvaCreate,
    ErvaRead,
    RendimentoCreate,
    RendimentoRead,
    SecadorCreate,
    SecadorRead,
)

MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "versions"
    / "20261022_1100_c4d8f1a6b2e0_cria_tabelas_de_cadastro_da_secagem.py"
)


@pytest.fixture
def sessao():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _liga_fk(dbapi_connection, _conexao):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    tabelas = [Erva.__table__, Secador.__table__, Capacidade.__table__, Rendimento.__table__]
    Base.metadata.create_all(engine, tables=tabelas)
    fabrica = sessionmaker(bind=engine, autoflush=False)
    db = fabrica()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(engine, tables=tabelas)
        engine.dispose()


def test_tabelas_anteriores_continuam_no_metadata():
    assert Item.__tablename__ == "items"
    assert Usuario.__tablename__ == "usuario"
    for nome in ("items", "usuario", "sessao", "importacao", "erva", "secador", "capacidade", "rendimento"):
        assert nome in Base.metadata.tables


def test_modo_capacidade_repete_os_valores_do_motor():
    assert {modo.value for modo in ModoCapacidade} == {modo.value for modo in ModoPlanner}


def test_migration_e_incremental_sobre_o_head_anterior():
    spec = importlib.util.spec_from_file_location("migration_cadastro", MIGRATION)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)

    assert modulo.revision == "c4d8f1a6b2e0"
    assert modulo.down_revision == "9b3e7c1d2a64"
    assert callable(modulo.upgrade)
    assert callable(modulo.downgrade)


def test_schema_de_erva_normaliza_codigo_e_aceita_campo_ausente():
    erva = ErvaCreate(codigo="  erva-teste  ", nome="  Erva sintética  ")

    assert erva.codigo == "ERVA-TESTE"
    assert erva.nome == "Erva sintética"
    assert erva.ativo is True
    assert erva.regime_horas_dia is None
    assert erva.espera_maxima_dias is None


def test_schema_rejeita_codigo_vazio_regime_zero_e_espera_negativa():
    with pytest.raises(ValidationError):
        ErvaCreate(codigo="   ", nome="Erva sintética")
    with pytest.raises(ValidationError):
        ErvaCreate(codigo="ERVA-TESTE", nome="Erva sintética", regime_horas_dia=0)
    with pytest.raises(ValidationError):
        ErvaCreate(codigo="ERVA-TESTE", nome="Erva sintética", regime_horas_dia=25)
    with pytest.raises(ValidationError):
        ErvaCreate(codigo="ERVA-TESTE", nome="Erva sintética", espera_maxima_dias=-1)


def test_schema_de_secador_e_de_parametros_opcionais():
    secador = SecadorCreate(codigo="sec-teste", nome="Secador sintético")
    capacidade = CapacidadeCreate(erva_id=1, secador_id=1)
    rendimento = RendimentoCreate(erva_id=1)

    assert secador.codigo == "SEC-TESTE"
    assert secador.ativo is True
    assert capacidade.modo is None
    assert capacidade.kg_fresco_por_hora is None
    assert capacidade.setup_dentro_do_regime is None
    assert capacidade.prioridade is None
    assert rendimento.fresco_por_desidratado is None
    assert rendimento.desidratado_por_moido is None


def test_schema_rejeita_zero_onde_o_motor_trataria_como_ausencia():
    with pytest.raises(ValidationError):
        CapacidadeCreate(erva_id=1, secador_id=1, kg_fresco_por_hora=0)
    with pytest.raises(ValidationError):
        CapacidadeCreate(erva_id=1, secador_id=1, setup_inicial_h=-1)
    with pytest.raises(ValidationError):
        RendimentoCreate(erva_id=1, fresco_por_desidratado=0)
    with pytest.raises(ValidationError):
        RendimentoCreate(erva_id=1, desidratado_por_moido=-2)


def test_schema_aceita_setup_zero_e_prioridade_zero():
    capacidade = CapacidadeCreate(
        erva_id=1,
        secador_id=1,
        setup_inicial_h=0,
        setup_final_h=0,
        setup_diario_h=0,
        setup_dentro_do_regime=False,
        prioridade=0,
        modo=ModoCapacidade.POR_CARGA,
        kg_por_carga=Decimal("3.5"),
        horas_por_carga=Decimal("1.25"),
    )

    assert capacidade.setup_inicial_h == 0
    assert capacidade.setup_dentro_do_regime is False
    assert capacidade.prioridade == 0
    assert capacidade.modo is ModoCapacidade.POR_CARGA


def test_cria_erva_e_le_de_volta(sessao):
    sessao.add(Erva(codigo="ERVA-TESTE", nome="Erva sintética", espera_maxima_dias=0))
    sessao.commit()

    erva = sessao.query(Erva).one()

    assert erva.id is not None
    assert erva.ativo is True
    assert erva.regime_horas_dia is None
    assert erva.espera_maxima_dias == 0
    assert erva.criado_em is not None
    assert erva.atualizado_em is not None


def test_cria_secador(sessao):
    sessao.add(Secador(codigo="SEC-TESTE", nome="Secador sintético", ativo=False))
    sessao.commit()

    secador = sessao.get(Secador, 1)

    assert secador.codigo == "SEC-TESTE"
    assert secador.nome == "Secador sintético"
    assert secador.ativo is False


def test_capacidade_liga_erva_e_secador(sessao):
    erva = Erva(codigo="ERVA-TESTE", nome="Erva sintética")
    secador = Secador(codigo="SEC-TESTE", nome="Secador sintético")
    sessao.add_all([erva, secador])
    sessao.commit()

    sessao.add(
        Capacidade(
            erva_id=erva.id,
            secador_id=secador.id,
            modo=ModoCapacidade.CONTINUO,
            kg_fresco_por_hora=Decimal("10.500"),
            setup_inicial_h=Decimal("1.00"),
            setup_final_h=Decimal("0.00"),
            setup_diario_h=Decimal("0.50"),
            setup_dentro_do_regime=True,
            prioridade=1,
        )
    )
    sessao.commit()

    capacidade = sessao.query(Capacidade).one()

    assert capacidade.erva.codigo == "ERVA-TESTE"
    assert capacidade.secador.codigo == "SEC-TESTE"
    assert capacidade.modo is ModoCapacidade.CONTINUO
    assert Decimal(capacidade.kg_fresco_por_hora) == Decimal("10.500")
    assert capacidade.setup_dentro_do_regime is True


def test_rendimento_guarda_as_duas_razoes_separadas(sessao):
    erva = Erva(codigo="ERVA-TESTE", nome="Erva sintética")
    sessao.add(erva)
    sessao.commit()
    sessao.add(
        Rendimento(
            erva_id=erva.id,
            fresco_por_desidratado=Decimal("2.5000"),
            desidratado_por_moido=Decimal("1.2500"),
        )
    )
    sessao.commit()

    rendimento = sessao.query(Rendimento).one()

    assert rendimento.erva.codigo == "ERVA-TESTE"
    assert Decimal(rendimento.fresco_por_desidratado) == Decimal("2.5000")
    assert Decimal(rendimento.desidratado_por_moido) == Decimal("1.2500")


def test_rendimento_pode_nascer_sem_razoes(sessao):
    erva = Erva(codigo="ERVA-TESTE", nome="Erva sintética")
    sessao.add(erva)
    sessao.commit()
    sessao.add(Rendimento(erva_id=erva.id))
    sessao.commit()

    rendimento = sessao.query(Rendimento).one()

    assert rendimento.fresco_por_desidratado is None
    assert rendimento.desidratado_por_moido is None


def test_codigo_de_erva_e_de_secador_sao_unicos(sessao):
    sessao.add(Erva(codigo="ERVA-TESTE", nome="Primeira"))
    sessao.commit()
    sessao.add(Erva(codigo="ERVA-TESTE", nome="Segunda"))
    with pytest.raises(IntegrityError):
        sessao.commit()
    sessao.rollback()

    sessao.add(Secador(codigo="SEC-TESTE", nome="Primeiro"))
    sessao.commit()
    sessao.add(Secador(codigo="SEC-TESTE", nome="Segundo"))
    with pytest.raises(IntegrityError):
        sessao.commit()


def test_par_erva_secador_e_rendimento_por_erva_sao_unicos(sessao):
    erva = Erva(codigo="ERVA-TESTE", nome="Erva sintética")
    outra = Erva(codigo="OUTRA-ERVA", nome="Outra erva sintética")
    secador = Secador(codigo="SEC-TESTE", nome="Secador sintético")
    outro = Secador(codigo="SEC-OUTRO", nome="Outro secador")
    sessao.add_all([erva, outra, secador, outro])
    sessao.commit()

    sessao.add(Capacidade(erva_id=erva.id, secador_id=secador.id))
    sessao.commit()
    sessao.add(Capacidade(erva_id=erva.id, secador_id=outro.id))
    sessao.add(Capacidade(erva_id=outra.id, secador_id=secador.id))
    sessao.commit()

    sessao.add(Capacidade(erva_id=erva.id, secador_id=secador.id))
    with pytest.raises(IntegrityError):
        sessao.commit()
    sessao.rollback()

    sessao.add(Rendimento(erva_id=erva.id, fresco_por_desidratado=Decimal("2.5")))
    sessao.commit()
    sessao.add(Rendimento(erva_id=erva.id, desidratado_por_moido=Decimal("1.25")))
    with pytest.raises(IntegrityError):
        sessao.commit()


def test_integridade_referencial_e_restricao_de_exclusao(sessao):
    sessao.add(Capacidade(erva_id=999, secador_id=998))
    with pytest.raises(IntegrityError):
        sessao.commit()
    sessao.rollback()

    erva = Erva(codigo="ERVA-TESTE", nome="Erva sintética")
    secador = Secador(codigo="SEC-TESTE", nome="Secador sintético")
    sessao.add_all([erva, secador])
    sessao.commit()
    sessao.add(Capacidade(erva_id=erva.id, secador_id=secador.id))
    sessao.add(Rendimento(erva_id=erva.id))
    sessao.commit()

    sessao.delete(erva)
    with pytest.raises(IntegrityError):
        sessao.commit()


def test_banco_recusa_regime_zero_e_razao_negativa(sessao):
    sessao.add(Erva(codigo="ERVA-TESTE", nome="Erva sintética", regime_horas_dia=0))
    with pytest.raises(IntegrityError):
        sessao.commit()
    sessao.rollback()

    erva = Erva(codigo="ERVA-TESTE", nome="Erva sintética")
    sessao.add(erva)
    sessao.commit()
    sessao.add(Rendimento(erva_id=erva.id, fresco_por_desidratado=-1))
    with pytest.raises(IntegrityError):
        sessao.commit()


def test_schemas_leem_os_objetos_persistidos(sessao):
    erva = Erva(codigo="ERVA-TESTE", nome="Erva sintética", regime_horas_dia=Decimal("8.50"))
    secador = Secador(codigo="SEC-TESTE", nome="Secador sintético")
    sessao.add_all([erva, secador])
    sessao.commit()
    capacidade = Capacidade(erva_id=erva.id, secador_id=secador.id, prioridade=2)
    rendimento = Rendimento(erva_id=erva.id, fresco_por_desidratado=Decimal("2.5000"))
    sessao.add_all([capacidade, rendimento])
    sessao.commit()

    erva_lida = ErvaRead.model_validate(erva)
    secador_lido = SecadorRead.model_validate(secador)
    capacidade_lida = CapacidadeRead.model_validate(capacidade)
    rendimento_lido = RendimentoRead.model_validate(rendimento)

    assert erva_lida.id == erva.id
    assert erva_lida.codigo == "ERVA-TESTE"
    assert erva_lida.regime_horas_dia == Decimal("8.50")
    assert secador_lido.nome == "Secador sintético"
    assert capacidade_lida.erva_id == erva.id
    assert capacidade_lida.secador_id == secador.id
    assert capacidade_lida.kg_fresco_por_hora is None
    assert rendimento_lido.fresco_por_desidratado == Decimal("2.5000")
    assert rendimento_lido.desidratado_por_moido is None


def test_mapeamento_preserva_ausencia_zero_e_falso():
    momento = datetime(2026, 10, 22, tzinfo=UTC)
    erva = Erva(
        id=1,
        codigo="ERVA-TESTE",
        nome="Erva sintética",
        ativo=False,
        regime_horas_dia=None,
        espera_maxima_dias=0,
        criado_em=momento,
        atualizado_em=momento,
    )
    secador = Secador(
        id=1,
        codigo="SEC-TESTE",
        nome="Secador sintético",
        ativo=True,
        criado_em=momento,
        atualizado_em=momento,
    )
    capacidade = Capacidade(
        id=1,
        erva_id=1,
        secador_id=1,
        modo=ModoCapacidade.CONTINUO,
        kg_fresco_por_hora=Decimal("10.500"),
        setup_inicial_h=Decimal("0.00"),
        setup_final_h=None,
        setup_diario_h=None,
        setup_dentro_do_regime=False,
        prioridade=0,
        criado_em=momento,
        atualizado_em=momento,
    )
    capacidade.erva = erva
    capacidade.secador = secador
    rendimento = Rendimento(
        id=1,
        erva_id=1,
        fresco_por_desidratado=Decimal("2.5000"),
        desidratado_por_moido=None,
        criado_em=momento,
        atualizado_em=momento,
    )
    rendimento.erva = erva

    erva_motor = para_erva(erva)
    secador_motor = para_secador(secador)
    capacidade_motor = para_capacidade(capacidade)
    rendimento_motor = para_rendimento(rendimento)

    assert erva_motor.codigo == "ERVA-TESTE"
    assert erva_motor.regime_horas_dia is None
    assert erva_motor.espera_maxima_dias == 0
    assert secador_motor.nome == "Secador sintético"
    assert capacidade_motor.erva == "ERVA-TESTE"
    assert capacidade_motor.secador == "SEC-TESTE"
    assert capacidade_motor.modo is ModoPlanner.CONTINUO
    assert capacidade_motor.kg_fresco_por_hora == pytest.approx(10.5)
    assert capacidade_motor.setup_inicial_h == 0
    assert capacidade_motor.setup_final_h is None
    assert capacidade_motor.setup_dentro_do_regime is False
    assert capacidade_motor.prioridade == 0
    assert rendimento_motor.fresco_por_desidratado == pytest.approx(2.5)
    assert rendimento_motor.desidratado_por_moido is None
