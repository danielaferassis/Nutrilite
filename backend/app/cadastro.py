"""Converte o cadastro persistido nos dataclasses do motor.

O pacote `app.planner` não importa SQLAlchemy. Quem for expor a simulação
carrega as linhas ativas, chama estas funções e monta `EntradaPlanejamento`.

`ativo` não existe no motor. Esta conversão não descarta inativos: o filtro
fica com quem monta a entrada da simulação.
"""

from decimal import Decimal

from app.models import Capacidade, Erva, Rendimento, Secador
from app.planner.types import Capacidade as CapacidadePlanner
from app.planner.types import Erva as ErvaPlanner
from app.planner.types import ModoCapacidade as ModoPlanner
from app.planner.types import Rendimento as RendimentoPlanner
from app.planner.types import Secador as SecadorPlanner


def _numero(valor: Decimal | float | None) -> float | None:
    if valor is None:
        return None
    return float(valor)


def para_erva(erva: Erva) -> ErvaPlanner:
    return ErvaPlanner(
        codigo=erva.codigo,
        nome=erva.nome,
        regime_horas_dia=_numero(erva.regime_horas_dia),
        espera_maxima_dias=erva.espera_maxima_dias,
    )


def para_secador(secador: Secador) -> SecadorPlanner:
    return SecadorPlanner(codigo=secador.codigo, nome=secador.nome)


def para_capacidade(capacidade: Capacidade) -> CapacidadePlanner:
    if capacidade.erva is None or capacidade.secador is None:
        raise ValueError("Capacidade sem erva ou secador carregados")
    modo = None if capacidade.modo is None else ModoPlanner(capacidade.modo.value)
    return CapacidadePlanner(
        erva=capacidade.erva.codigo,
        secador=capacidade.secador.codigo,
        kg_fresco_por_hora=_numero(capacidade.kg_fresco_por_hora),
        setup_inicial_h=_numero(capacidade.setup_inicial_h),
        setup_final_h=_numero(capacidade.setup_final_h),
        setup_diario_h=_numero(capacidade.setup_diario_h),
        modo=modo,
        kg_por_carga=_numero(capacidade.kg_por_carga),
        horas_por_carga=_numero(capacidade.horas_por_carga),
        setup_dentro_do_regime=capacidade.setup_dentro_do_regime,
        prioridade=capacidade.prioridade,
    )


def para_rendimento(rendimento: Rendimento) -> RendimentoPlanner:
    return RendimentoPlanner(
        erva=rendimento.erva.codigo,
        fresco_por_desidratado=_numero(rendimento.fresco_por_desidratado),
        desidratado_por_moido=_numero(rendimento.desidratado_por_moido),
    )
