"""Qual plano aprovado vale em cada dia.

Regra: em cada dia, vale o plano aprovado mais recente cujo horizonte cobre
aquele dia. Um plano novo só tira de vigor os dias que ele cobre; os outros
dias do plano anterior continuam valendo. O plano vira `substituido` quando
não sobra nenhum dia em que ele valha.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from app.models import Plano, StatusPlano


@dataclass(frozen=True)
class Trecho:
    """Dias seguidos em que um plano vale."""

    plano: Plano
    inicio: date
    fim: date  # inclusivo


def _ordem_aprovacao(plano: Plano) -> tuple:
    # Mais recente = aprovado por último. O id só desempata aprovações no mesmo segundo.
    return (plano.aprovado_em, plano.id)


def _dias(inicio: date, fim: date):
    dia = inicio
    while dia <= fim:
        yield dia
        dia += timedelta(days=1)


def vigente_por_dia(
    planos: list[Plano], de: date, ate: date, mais_recente: Plano | None = None
) -> dict[date, Plano]:
    """Para cada dia de `de` a `ate`, o plano aprovado que vale (dia sem plano fica de fora).

    Só os planos com status `aprovado` contam. `mais_recente` é o plano sendo
    aprovado agora: entra por último, vença o que vencer no horário de aprovação.
    """
    aprovados = sorted(
        (
            p
            for p in planos
            if p.status == StatusPlano.APROVADO and (mais_recente is None or p.id != mais_recente.id)
        ),
        key=_ordem_aprovacao,
    )
    if mais_recente is not None:
        aprovados.append(mais_recente)
    vigentes: dict[date, Plano] = {}
    for plano in aprovados:  # do mais antigo ao mais novo: o mais novo sobrescreve
        for dia in _dias(max(plano.inicio, de), min(plano.fim, ate)):
            vigentes[dia] = plano
    return vigentes


def trechos_vigentes(planos: list[Plano], de: date, ate: date) -> list[Trecho]:
    """Os dias de `vigente_por_dia` agrupados em trechos contínuos do mesmo plano."""
    trechos: list[Trecho] = []
    for dia, plano in sorted(vigente_por_dia(planos, de, ate).items()):
        ultimo = trechos[-1] if trechos else None
        if ultimo and ultimo.plano.id == plano.id and ultimo.fim + timedelta(days=1) == dia:
            trechos[-1] = Trecho(plano, ultimo.inicio, dia)
        else:
            trechos.append(Trecho(plano, dia, dia))
    return trechos
