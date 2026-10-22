"""Capacidade dos secadores por dia (pergunta P2).

Responde: quantas horas e quantos kg de erva fresca um secador consegue
processar em um dia, para uma erva específica?

O que NÃO está aqui: decidir qual erva vai para qual secador, nem em que
ponto da campanha cada dia está. Isso é da alocação (`engine._alocar`), que
informa `primeiro_dia`, `encerra_campanha` e a erva `anterior`.

Parâmetro ausente (`None`) levanta ParametroAusenteError; nunca vira zero.
"""

from __future__ import annotations

import math
from datetime import date

from app.planner.conversion import ParametroAusenteError
from app.planner.types import BloqueioSecador, Capacidade, Erva, ModoCapacidade

HORAS_DIA = 24
# Folga para erro de ponto flutuante ao contar cargas inteiras (0,7 / 0,1 = 6,999…).
_TOLERANCIA_CARGA = 1e-9


def _exigir(valor, nome: str, capacidade: Capacidade):
    """Retorna `valor` ou levanta ParametroAusenteError se ele for None."""
    if valor is None:
        raise ParametroAusenteError(
            f"{nome} ausente para {capacidade.erva} × {capacidade.secador}", capacidade.erva
        )
    return valor


def _validar_horas(horas: float) -> None:
    if horas < 0:
        raise ValueError(f"Horas negativas: {horas}")


def secador_disponivel(
    secador: str,
    dia: date,
    bloqueios: list[BloqueioSecador],
    dias_operacao: frozenset[int] | None,
) -> bool:
    """False se o `dia` está fora de `dias_operacao` (0 = segunda … 6 = domingo)
    ou se algum bloqueio do `secador` o cobre (início e fim inclusivos).

    Levanta ParametroAusenteError se `dias_operacao` for None.
    """
    if dias_operacao is None:
        raise ParametroAusenteError("Dias de operação da fábrica não informados")
    if dia.weekday() not in dias_operacao:
        return False
    return not any(b.secador == secador and b.inicio <= dia <= b.fim for b in bloqueios)


def horas_setup_dia(
    capacidade: Capacidade,
    primeiro_dia: bool,
    encerra_campanha: bool,
    anterior: Capacidade | None = None,
) -> float:
    """Horas de setup do dia para a erva de `capacidade` no secador.

    - todo dia: setup_diario;
    - `primeiro_dia`: + setup_inicial;
    - `primeiro_dia` com `anterior` (troca de erva): + setup_final da anterior;
    - `encerra_campanha`: + setup_final (a alocação decide em que dia cobrar).

    Levanta ValueError se `anterior` vier fora do primeiro dia, for da mesma
    erva (não é troca) ou de outro secador.
    """
    if anterior is not None:
        if not primeiro_dia:
            raise ValueError("Troca de erva só acontece no primeiro dia da campanha")
        if anterior.erva == capacidade.erva:
            raise ValueError(f"Erva anterior igual à nova ({capacidade.erva}): não é troca")
        if anterior.secador != capacidade.secador:
            raise ValueError(
                f"Erva anterior em outro secador ({anterior.secador} ≠ {capacidade.secador})"
            )

    horas = _exigir(capacidade.setup_diario_h, "setup_diario_h", capacidade)
    if primeiro_dia:
        horas += _exigir(capacidade.setup_inicial_h, "setup_inicial_h", capacidade)
        if anterior is not None:
            horas += _exigir(anterior.setup_final_h, "setup_final_h", anterior)
    if encerra_campanha:
        horas += _exigir(capacidade.setup_final_h, "setup_final_h", capacidade)
    return horas


def horas_uteis(erva: Erva, capacidade: Capacidade, horas_setup: float) -> float:
    """Horas de secagem efetiva no dia.

    - setup dentro do regime: max(0, regime − setup);
    - setup fora do regime:   max(0, min(regime, 24 − setup)).
    """
    if erva.regime_horas_dia is None:
        raise ParametroAusenteError(f"Regime de horas/dia ausente para {erva.codigo}", erva.codigo)
    regime = erva.regime_horas_dia
    dentro = _exigir(capacidade.setup_dentro_do_regime, "setup_dentro_do_regime", capacidade)

    if dentro:
        return max(0.0, regime - horas_setup)
    return max(0.0, min(regime, HORAS_DIA - horas_setup))


def cargas_no_dia(capacidade: Capacidade, horas: float) -> int:
    """Cargas inteiras que cabem em `horas` (modo POR_CARGA).

    Tolera erro de ponto flutuante (0,7 h / 0,1 h = 7 cargas, não 6).
    Levanta ValueError para horas negativas ou modo diferente de POR_CARGA.
    """
    _validar_horas(horas)
    if capacidade.modo != ModoCapacidade.POR_CARGA:
        raise ValueError(f"Capacidade {capacidade.erva} × {capacidade.secador} não é por carga")
    horas_por_carga = _exigir(capacidade.horas_por_carga, "horas_por_carga", capacidade)
    return math.floor(horas / horas_por_carga + _TOLERANCIA_CARGA)


def kg_no_dia(capacidade: Capacidade, horas: float) -> float:
    """kg de erva fresca processados em `horas` de secagem efetiva.

    - CONTINUO: horas × kg_fresco_por_hora;
    - POR_CARGA: cargas_no_dia × kg_por_carga.

    Levanta ValueError para horas negativas.
    """
    _validar_horas(horas)
    modo = _exigir(capacidade.modo, "modo", capacidade)
    if modo == ModoCapacidade.POR_CARGA:
        kg_por_carga = _exigir(capacidade.kg_por_carga, "kg_por_carga", capacidade)
        return cargas_no_dia(capacidade, horas) * kg_por_carga
    return horas * _exigir(capacidade.kg_fresco_por_hora, "kg_fresco_por_hora", capacidade)
