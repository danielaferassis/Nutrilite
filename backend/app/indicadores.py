"""Indicadores da secagem: OEE e aderência ao plano, por secador e dia.

Calculados com os apontamentos do Infinity (apontamento_secagem), o cadastro
e o plano aprovado que vale em cada dia (app/vigencia.py).

- Disponibilidade = horas apontadas ÷ horas disponíveis. Disponível = 24 h em
  cada dia sem bloqueio do secador e dentro dos dias de operação do plano que
  vale no dia (sem plano no dia, o dia conta). Mesmo denominador da ocupação
  planejada do motor.
- Performance = tempo padrão ÷ tempo real das cargas. Tempo padrão de uma carga:
  horas_por_carga (POR_CARGA) ou kg ÷ kg_fresco_por_hora (CONTINUO), da
  capacidade erva × secador. Carga sem esse parâmetro fica de fora e é contada.
- Qualidade: None ("não informada"). O Infinity não traz refugo.
- OEE = A × P × Q. Sem qualidade, fica None; `oee_sem_qualidade` = A × P.
- Aderência ao plano, por erva e sem somar kg de ervas diferentes: em cada
  secador × dia, cada erva planejada vale as horas que o plano reservou para
  ela (secagem + setup), e essas horas contam como cumpridas na proporção do
  que foi seco *daquela erva* (até 100%). Aderência = horas cumpridas ÷ horas
  planejadas. Secar outra erva no lugar não cumpre nada; secar a mais não
  compensa outro dia. Os kg aparecem só por erva (`por_erva`).
- Só contam os dias até hoje: dia futuro não tem disponibilidade nem plano a
  cumprir. Sem nenhum apontamento no período, disponibilidade e OEE ficam None
  ("sem apontamentos"), não 0%: não dá para distinguir parada de falta de dado.

Regra do projeto: denominador zero ou parâmetro ausente → None, nunca 0.
Percentuais com 1 casa.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import calendario
from app.models import (
    ApontamentoSecagem,
    BloqueioSecador,
    Capacidade,
    Erva,
    ModoCapacidade,
    Plano,
    PlanoAlocacao,
    Secador,
    StatusPlano,
)
from app.vigencia import vigente_por_dia

HORAS_DIA = 24


@dataclass
class Acumulado:
    """Somas de um secador (num dia ou no período)."""

    horas_disponiveis: float = 0.0
    horas_apontadas: float = 0.0
    horas_padrao: float = 0.0  # tempo padrão das cargas com parâmetro
    horas_reais_com_padrao: float = 0.0  # tempo real dessas mesmas cargas
    cargas: int = 0
    cargas_sem_padrao: int = 0
    horas_planejadas: float = 0.0  # secagem + setup das alocações do plano
    horas_cumpridas: float = 0.0  # parte dessas horas cumprida com a erva planejada
    dias_disponiveis: int = 0
    # Por erva (código): kg só se comparam dentro da mesma erva
    kg_planejado: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    kg_apontado: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    horas_planejadas_erva: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    horas_cumpridas_erva: dict[str, float] = field(default_factory=lambda: defaultdict(float))

    def somar(self, outro: "Acumulado") -> None:
        for campo in self.__dataclass_fields__:
            atual, extra = getattr(self, campo), getattr(outro, campo)
            if isinstance(atual, dict):
                for chave, valor in extra.items():
                    atual[chave] += valor
            else:
                setattr(self, campo, atual + extra)

    def fechar_dia(self) -> None:
        """Horas cumpridas do dia: cada erva planejada, na proporção do que foi seco dela."""
        for erva, horas in self.horas_planejadas_erva.items():
            cumprido = min(1.0, self.kg_apontado.get(erva, 0.0) / self.kg_planejado[erva])
            self.horas_cumpridas_erva[erva] += horas * cumprido
            self.horas_cumpridas += horas * cumprido


def _pct(numerador: float, denominador: float) -> float | None:
    return round(100 * numerador / denominador, 1) if denominador else None


def indicadores(acc: Acumulado, com_apontamentos: bool = True) -> dict:
    # Sem nenhum apontamento no período: "sem dado", não 0% (parada ou falta de importação?)
    disponibilidade = _pct(acc.horas_apontadas, acc.horas_disponiveis) if com_apontamentos else None
    performance = _pct(acc.horas_padrao, acc.horas_reais_com_padrao)
    sem_qualidade = (
        round(disponibilidade * performance / 100, 1)
        if disponibilidade is not None and performance is not None
        else None
    )
    return {
        "horas_disponiveis": round(acc.horas_disponiveis, 2),
        "horas_apontadas": round(acc.horas_apontadas, 2),
        "cargas": acc.cargas,
        "cargas_sem_padrao": acc.cargas_sem_padrao,
        "disponibilidade_pct": disponibilidade,
        "performance_pct": performance,
        "qualidade_pct": None,  # o Infinity não traz refugo
        "oee_pct": None,  # sem qualidade não há OEE completo
        "oee_sem_qualidade_pct": sem_qualidade,
        "horas_planejadas": round(acc.horas_planejadas, 2),
        "horas_cumpridas": round(acc.horas_cumpridas, 2),
        "aderencia_pct": _pct(acc.horas_cumpridas, acc.horas_planejadas),
        "por_erva": [
            {
                "erva": erva,
                "kg_planejado": round(acc.kg_planejado.get(erva, 0.0), 3),
                "kg_apontado": round(acc.kg_apontado.get(erva, 0.0), 3),
                "aderencia_pct": _pct(
                    acc.horas_cumpridas_erva.get(erva, 0.0), acc.horas_planejadas_erva.get(erva, 0.0)
                ),
            }
            for erva in sorted(set(acc.kg_planejado) | set(acc.kg_apontado))
        ],
    }


@dataclass
class Resultado:
    por_dia: dict[tuple[int, date], Acumulado] = field(default_factory=dict)
    avisos: list[str] = field(default_factory=list)
    com_apontamentos: bool = False


def _dias(de: date, ate: date):
    dia = de
    while dia <= ate:
        yield dia
        dia += timedelta(days=1)


def calcular(
    db: Session, de: date, ate: date, secadores: list[Secador], hoje: date | None = None
) -> Resultado:
    ids = [s.id for s in secadores]
    por_codigo = {s.codigo: s.id for s in secadores}
    resultado = Resultado()
    acc = resultado.por_dia
    hoje = hoje or calendario.hoje()
    ultimo = min(ate, hoje)  # dia futuro não tem o que medir
    if ate > hoje:
        resultado.avisos.append(
            f"Os dias depois de hoje ({hoje:%d/%m/%Y}) não entram nos indicadores"
        )
    if ultimo < de:
        return resultado
    for secador in secadores:
        for dia in _dias(de, ultimo):
            acc[(secador.id, dia)] = Acumulado()

    # Plano que vale em cada dia: dias de operação e kg planejados
    planos = db.scalars(
        select(Plano).where(
            Plano.status == StatusPlano.APROVADO, Plano.inicio <= ultimo, Plano.fim >= de
        )
    ).all()
    vigentes = vigente_por_dia(planos, de, ultimo)
    bloqueios = db.scalars(
        select(BloqueioSecador).where(
            BloqueioSecador.secador_id.in_(ids), BloqueioSecador.inicio <= ultimo, BloqueioSecador.fim >= de
        )
    ).all()
    for (secador_id, dia), a in acc.items():
        plano = vigentes.get(dia)
        dias_operacao = (plano.parametros or {}).get("dias_operacao") if plano else None
        fora_de_operacao = dias_operacao is not None and dia.weekday() not in dias_operacao
        bloqueado = any(b.secador_id == secador_id and b.inicio <= dia <= b.fim for b in bloqueios)
        if not fora_de_operacao and not bloqueado:
            a.horas_disponiveis = HORAS_DIA
            a.dias_disponiveis = 1

    if vigentes:
        alocacoes = db.scalars(
            select(PlanoAlocacao).where(
                PlanoAlocacao.plano_id.in_({p.id for p in vigentes.values()}),
                PlanoAlocacao.dia >= de,
                PlanoAlocacao.dia <= ultimo,
            )
        ).all()
        for alocacao in alocacoes:
            secador_id = por_codigo.get(alocacao.secador)
            if secador_id is None or vigentes[alocacao.dia].id != alocacao.plano_id:
                continue
            a = acc[(secador_id, alocacao.dia)]
            horas = float(alocacao.horas_secagem) + float(alocacao.horas_setup)
            a.kg_planejado[alocacao.erva] += float(alocacao.kg_fresco)
            a.horas_planejadas_erva[alocacao.erva] += horas
            a.horas_planejadas += horas

    # O que de fato foi seco
    capacidades = {
        (c.erva_id, c.secador_id): c
        for c in db.scalars(select(Capacidade).where(Capacidade.secador_id.in_(ids)))
    }
    codigo_da_erva = dict(db.execute(select(Erva.id, Erva.codigo)).all())
    apontamentos = db.scalars(
        select(ApontamentoSecagem).where(
            ApontamentoSecagem.secador_id.in_(ids),
            ApontamentoSecagem.data >= de,
            ApontamentoSecagem.data <= ultimo,
        )
    ).all()
    resultado.com_apontamentos = bool(apontamentos)
    for ap in apontamentos:
        a = acc[(ap.secador_id, ap.data)]
        horas = float(ap.duracao_min) / 60
        a.cargas += 1
        a.horas_apontadas += horas
        a.kg_apontado[codigo_da_erva[ap.erva_id]] += float(ap.quantidade_kg)
        padrao = _tempo_padrao(capacidades.get((ap.erva_id, ap.secador_id)), ap.quantidade_kg)
        if padrao is None:
            a.cargas_sem_padrao += 1
        else:
            a.horas_padrao += padrao
            a.horas_reais_com_padrao += horas
    for a in acc.values():
        a.fechar_dia()

    sem_padrao = sum(a.cargas_sem_padrao for a in acc.values())
    if sem_padrao:
        resultado.avisos.append(
            f"{sem_padrao} carga(s) sem tempo padrão na Matriz de Capacidade (erva × secador): "
            "ficaram fora da performance"
        )
    if not apontamentos:
        resultado.avisos.append(
            "Nenhum apontamento do Infinity no período: disponibilidade e OEE ficam sem dado (n/a)"
        )
    if not planos:
        resultado.avisos.append("Nenhum plano aprovado no período: sem aderência ao plano")
    return resultado


def _tempo_padrao(capacidade: Capacidade | None, kg: Decimal) -> float | None:
    """Horas que a carga deveria levar pelo cadastro; None se faltar parâmetro."""
    if capacidade is None or capacidade.modo is None:
        return None
    if capacidade.modo == ModoCapacidade.POR_CARGA:
        return float(capacidade.horas_por_carga) if capacidade.horas_por_carga else None
    if capacidade.kg_fresco_por_hora:
        return float(kg) / float(capacidade.kg_fresco_por_hora)
    return None


def resumo(resultado: Resultado, secadores: list[Secador]) -> tuple[list[dict], list[dict], dict]:
    """(por secador no período, por secador e dia, total da fábrica)."""
    por_secador = {s.id: Acumulado() for s in secadores}
    dias = []
    for (secador_id, dia), a in sorted(resultado.por_dia.items(), key=lambda x: (x[0][1], x[0][0])):
        por_secador[secador_id].somar(a)
        if a.cargas or a.horas_planejadas:
            dias.append({"dia": dia, "secador_id": secador_id, **indicadores(a, resultado.com_apontamentos)})
    total = Acumulado()
    for a in por_secador.values():
        total.somar(a)
    secadores_ordenados = sorted(secadores, key=lambda s: s.codigo)
    com = resultado.com_apontamentos
    return (
        [{"secador": s, **indicadores(por_secador[s.id], com)} for s in secadores_ordenados],
        dias,
        indicadores(total, com),
    )
