"""Capacidade dos secadores por dia (pergunta P2).

Responde: quantas horas e quantos kg de erva fresca um secador consegue
processar em um dia, para uma erva específica?

O que NÃO está aqui: decidir qual erva vai para qual secador, nem em que
ponto da campanha cada dia está. Isso é da alocação (`engine._alocar`), que
informa `primeiro_dia`, `encerra_campanha` e a erva `anterior`.

Parâmetro ausente (`None`) levanta ParametroAusenteError; nunca vira zero.
"""

from __future__ import annotations

from datetime import date

from app.planner.types import BloqueioSecador, Capacidade, Erva


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
    raise NotImplementedError


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
    raise NotImplementedError


def horas_uteis(erva: Erva, capacidade: Capacidade, horas_setup: float) -> float:
    """Horas de secagem efetiva no dia.

    - setup dentro do regime: max(0, regime − setup);
    - setup fora do regime:   max(0, min(regime, 24 − setup)).
    """
    raise NotImplementedError


def cargas_no_dia(capacidade: Capacidade, horas: float) -> int:
    """Cargas inteiras que cabem em `horas` (modo POR_CARGA).

    Tolera erro de ponto flutuante (0,7 h / 0,1 h = 7 cargas, não 6).
    Levanta ValueError para horas negativas ou modo diferente de POR_CARGA.
    """
    raise NotImplementedError


def kg_no_dia(capacidade: Capacidade, horas: float) -> float:
    """kg de erva fresca processados em `horas` de secagem efetiva.

    - CONTINUO: horas × kg_fresco_por_hora;
    - POR_CARGA: cargas_no_dia × kg_por_carga.

    Levanta ValueError para horas negativas.
    """
    raise NotImplementedError
