"""Conversão entre estágios do produto (RI01 / pergunta P1).

Responde: quantos kg de erva fresca são necessários para atender a meta de
produto desidratado ou moído de cada demanda?
"""

from __future__ import annotations

from app.planner.types import Demanda, Estagio, NecessidadeFresca, Rendimento


class ParametroAusenteError(ValueError):
    """Um parâmetro necessário ao cálculo não foi cadastrado."""

    def __init__(self, mensagem: str, erva: str | None = None) -> None:
        super().__init__(mensagem)
        self.erva = erva


def kg_fresco_necessario(kg: float, estagio: Estagio, rendimento: Rendimento | None) -> float:
    """Converte `kg` no `estagio` informado para kg de erva fresca.

    Cálculo reverso pelas razões de rendimento:
        moído → desidratado: kg × desidratado_por_moido
        desidratado → fresco: kg × fresco_por_desidratado

    Levanta ParametroAusenteError se faltar alguma razão necessária.
    """
    if kg < 0:
        raise ValueError(f"Quantidade negativa: {kg}")

    if estagio == Estagio.FRESCO:
        return kg

    if rendimento is None:
        raise ParametroAusenteError("Rendimento não cadastrado para a erva")

    if estagio == Estagio.MOIDO:
        if not rendimento.desidratado_por_moido:
            raise ParametroAusenteError(
                f"Razão desidratado→moído ausente para {rendimento.erva}", rendimento.erva
            )
        kg = kg * rendimento.desidratado_por_moido

    if not rendimento.fresco_por_desidratado:
        raise ParametroAusenteError(
            f"Razão fresco→desidratado ausente para {rendimento.erva}", rendimento.erva
        )
    return kg * rendimento.fresco_por_desidratado


def necessidade_fresca(demanda: Demanda, rendimentos: dict[str, Rendimento]) -> NecessidadeFresca:
    """Converte uma demanda (já somada a reserva) em necessidade de erva fresca."""
    kg_meta = demanda.kg + demanda.reserva_kg
    try:
        kg_fresco = kg_fresco_necessario(kg_meta, demanda.estagio, rendimentos.get(demanda.erva))
    except ParametroAusenteError as erro:
        erro.erva = demanda.erva
        raise
    return NecessidadeFresca(
        demanda_id=demanda.id,
        erva=demanda.erva,
        kg_meta=kg_meta,
        estagio_meta=demanda.estagio,
        kg_fresco=round(kg_fresco, 3),
        prazo=demanda.prazo,
    )
