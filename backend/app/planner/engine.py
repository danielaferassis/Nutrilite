"""Ponto de entrada do motor de planejamento.

Fluxo de `simular()`:
1. Validar parâmetros (validation.py). Faltou algo → PARAM_AUSENTE e para.
2. Converter demandas em necessidade de erva fresca (conversion.py).
3. Alocar lotes nos secadores dia a dia (`_alocar`).
4. Calcular KPIs (`_calcular_kpis`).
"""

from __future__ import annotations

import logging
import math
from collections import defaultdict
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, timedelta

from app.planner.capacity import (
    HORAS_DIA,
    horas_setup_dia,
    horas_uteis,
    kg_no_dia,
    secador_disponivel,
)
from app.planner.conversion import ParametroAusenteError, necessidade_fresca
from app.planner.types import (
    Alocacao,
    Capacidade,
    EntradaPlanejamento,
    LotePrevisto,
    ModoCapacidade,
    NecessidadeFresca,
    Pendencia,
    ResultadoPlano,
    TipoPendencia,
)
from app.planner.validation import validar_entrada

log = logging.getLogger(__name__)

# Folga para comparar kg e horas em ponto flutuante.
_EPS = 1e-6


def simular(entrada: EntradaPlanejamento) -> ResultadoPlano:
    """Gera uma proposta de plano. Não grava nada: quem persiste é a API."""
    resultado = ResultadoPlano()

    resultado.pendencias.extend(validar_entrada(entrada))
    if resultado.pendencias:
        log.info("Simulação interrompida: %d parâmetro(s) ausente(s)", len(resultado.pendencias))
        return resultado

    rendimentos = {r.erva: r for r in entrada.rendimentos}
    for demanda in entrada.demandas:
        try:
            resultado.necessidades.append(necessidade_fresca(demanda, rendimentos))
        except ParametroAusenteError as erro:
            resultado.pendencias.append(
                Pendencia(
                    tipo=TipoPendencia.PARAM_AUSENTE,
                    mensagem=str(erro),
                    erva=erro.erva,
                    demanda_id=demanda.id,
                )
            )

    if resultado.pendencias:
        return resultado

    _alocar(entrada, resultado)
    resultado.kpis = _calcular_kpis(entrada, resultado)
    log.info(
        "Simulação concluída: %d alocação(ões), %d pendência(s)",
        len(resultado.alocacoes),
        len(resultado.pendencias),
    )
    return resultado


# ---------------------------------------------------------------------------
# Alocação
# ---------------------------------------------------------------------------


@dataclass
class _LoteEmAberto:
    """Lote previsto com o saldo que ainda falta secar."""

    lote: LotePrevisto
    vencimento: date  # último dia em que ainda pode ser secado
    saldo: float

    def disponivel(self, dia: date) -> bool:
        return self.saldo > _EPS and self.lote.data_chegada <= dia <= self.vencimento


@dataclass
class _NecessidadeEmAberto:
    necessidade: NecessidadeFresca
    prioridade: int
    restante: float  # kg de fresco que ainda faltam secar até o prazo


@dataclass(frozen=True)
class _Plano:
    """O que um secador faz com uma erva em um dia."""

    capacidade: Capacidade
    kg: float
    horas_secagem: float
    horas_setup: float
    encerra_campanha: bool


def _alocar(entrada: EntradaPlanejamento, resultado: ResultadoPlano) -> None:
    """Alocação gulosa dia a dia. Regras e premissas no README do planner.

    Para cada dia do horizonte:
    1. Lote vencido (data_chegada + espera_maxima_dias) com saldo → CAPACIDADE_EXCEDIDA.
    2. Enquanto houver secador livre e erva com saldo disponível:
       - a erva mais urgente escolhe primeiro: menos secadores já usados no
         dia, vencimento mais próximo, maior prioridade de demanda, maior saldo;
       - ela vai para o secador livre que seca mais kg nesse dia, já
         descontados os setups (continuar campanha sai mais barato que trocar).
    3. Os kg secos saem dos lotes que vencem primeiro e atendem as demandas
       de maior prioridade (e prazo mais próximo) que ainda estão no prazo.
    No fim: demanda não coberta até o prazo → ATRASO; necessidade maior que a
    oferta do horizonte → SALDO_NAO_ALOCADO.
    """
    _Alocador(entrada, resultado).executar()


class _Alocador:
    def __init__(self, entrada: EntradaPlanejamento, resultado: ResultadoPlano) -> None:
        self.entrada = entrada
        self.resultado = resultado
        self.ervas = {e.codigo: e for e in entrada.ervas}
        self.capacidades = {(c.erva, c.secador): c for c in entrada.capacidades}

        # Só entram lotes que podem ser secados dentro do horizonte.
        self.lotes: list[_LoteEmAberto] = []
        for lote in sorted(entrada.lotes, key=lambda lote: (lote.data_chegada, lote.id)):
            vencimento = lote.data_chegada + timedelta(days=self.ervas[lote.erva].espera_maxima_dias)
            if lote.data_chegada <= entrada.fim and vencimento >= entrada.inicio:
                self.lotes.append(_LoteEmAberto(lote, vencimento, lote.kg_fresco))

        prioridades = {d.id: d.prioridade for d in entrada.demandas}
        self.necessidades = [
            _NecessidadeEmAberto(n, prioridades.get(n.demanda_id, 0), n.kg_fresco)
            for n in resultado.necessidades
        ]

        # Campanha aberta em cada secador (None = secador limpo).
        self.campanhas: dict[str, Capacidade | None] = {s.codigo: None for s in entrada.secadores}

    def executar(self) -> None:
        for dia in _dias(self.entrada.inicio, self.entrada.fim):
            self._registrar_vencidos(dia)
            self._alocar_dia(dia)
        # Lote que vence no último dia do horizonte e sobrou também é perda.
        self._registrar_vencidos(self.entrada.fim + timedelta(days=1))
        self._registrar_atrasos()
        self._registrar_sem_oferta()

    # -- um dia --------------------------------------------------------------

    def _alocar_dia(self, dia: date) -> None:
        livres = sorted(
            s.codigo
            for s in self.entrada.secadores
            if secador_disponivel(s.codigo, dia, self.entrada.bloqueios, self.entrada.dias_operacao)
        )
        secadores_por_erva: dict[str, int] = defaultdict(int)

        while livres:
            escolha = self._escolher(dia, livres, secadores_por_erva)
            if escolha is None:
                break
            secador, plano = escolha
            livres.remove(secador)
            secadores_por_erva[plano.capacidade.erva] += 1
            self._registrar_plano(dia, secador, plano)

    def _escolher(
        self, dia: date, livres: list[str], secadores_por_erva: dict[str, int]
    ) -> tuple[str, _Plano] | None:
        """Erva mais urgente com algum secador livre capaz; o secador que seca mais kg."""
        saldos: dict[str, float] = defaultdict(float)
        vencimentos: dict[str, date] = {}
        for lote in self.lotes:
            if lote.disponivel(dia):
                erva = lote.lote.erva
                saldos[erva] += lote.saldo
                vencimentos[erva] = min(vencimentos.get(erva, lote.vencimento), lote.vencimento)

        ordem = sorted(
            saldos,
            key=lambda e: (
                secadores_por_erva[e],
                vencimentos[e],
                -self._prioridade_maxima(e, dia),
                -saldos[e],
                e,
            ),
        )
        for erva in ordem:
            candidatos = []
            for secador in livres:
                capacidade = self.capacidades.get((erva, secador))
                if capacidade is None:
                    continue
                plano = self._planejar(dia, capacidade, saldos[erva])
                if plano is not None:
                    candidatos.append((secador, plano))
            if candidatos:
                # Mais kg; empate: menos setup; depois o código do secador.
                return min(candidatos, key=lambda c: (-c[1].kg, c[1].horas_setup, c[0]))
        return None

    def _planejar(self, dia: date, capacidade: Capacidade, saldo: float) -> _Plano | None:
        """Quanto `capacidade.secador` seca de `capacidade.erva` hoje (None = nada)."""
        aberta = self.campanhas[capacidade.secador]
        continua = aberta is not None and aberta.erva == capacidade.erva
        anterior = None if aberta is None or continua else aberta
        erva = self.ervas[capacidade.erva]

        def no_dia(encerra: bool) -> tuple[float, float]:
            setup = horas_setup_dia(
                capacidade, primeiro_dia=not continua, encerra_campanha=encerra, anterior=anterior
            )
            return setup, kg_no_dia(capacidade, horas_uteis(erva, capacidade, setup))

        # Sem oferta futura da erva: se o saldo cabe hoje junto com a limpeza,
        # a campanha encerra hoje.
        if not self._tem_oferta_futura(capacidade.erva, dia):
            setup, kg = no_dia(encerra=True)
            if kg >= saldo - _EPS:
                return _Plano(capacidade, saldo, _horas_secagem(capacidade, saldo), setup, True)

        setup, kg = no_dia(encerra=False)
        if kg <= _EPS:
            return None
        kg = min(kg, saldo)
        return _Plano(capacidade, kg, _horas_secagem(capacidade, kg), setup, False)

    def _registrar_plano(self, dia: date, secador: str, plano: _Plano) -> None:
        """Baixa o saldo dos lotes, destina às demandas e grava as alocações."""
        erva = plano.capacidade.erva
        pedacos: list[tuple[str, str | None, float]] = []  # (lote_id, demanda_id, kg)
        restante = plano.kg
        lotes = sorted(
            (lote for lote in self.lotes if lote.lote.erva == erva and lote.disponivel(dia)),
            key=lambda lote: (lote.vencimento, lote.lote.data_chegada, lote.lote.id),
        )
        for lote in lotes:
            if restante <= _EPS:
                break
            kg_lote = min(lote.saldo, restante)
            lote.saldo -= kg_lote
            restante -= kg_lote
            for demanda_id, kg in self._destinar(erva, dia, kg_lote):
                pedacos.append((lote.lote.id, demanda_id, kg))

        for i, (lote_id, demanda_id, kg) in enumerate(pedacos):
            self.resultado.alocacoes.append(
                Alocacao(
                    secador=secador,
                    erva=erva,
                    dia=dia,
                    kg_fresco=round(kg, 3),
                    # Horas de secagem proporcionais aos kg; o setup do dia fica na 1ª linha.
                    horas_secagem=round(plano.horas_secagem * kg / plano.kg, 3),
                    horas_setup=plano.horas_setup if i == 0 else 0.0,
                    lote_id=lote_id,
                    demanda_id=demanda_id,
                )
            )
        self.campanhas[secador] = None if plano.encerra_campanha else plano.capacidade

    def _destinar(self, erva: str, dia: date, kg: float) -> Iterator[tuple[str | None, float]]:
        """Divide `kg` entre as demandas no prazo; o que sobra fica sem demanda (None)."""
        abertas = sorted(
            (
                n
                for n in self.necessidades
                if n.necessidade.erva == erva and n.necessidade.prazo >= dia and n.restante > _EPS
            ),
            key=lambda n: (-n.prioridade, n.necessidade.prazo, n.necessidade.demanda_id),
        )
        for n in abertas:
            if kg <= _EPS:
                return
            parte = min(kg, n.restante)
            n.restante -= parte
            kg -= parte
            yield n.necessidade.demanda_id, parte
        if kg > _EPS:
            yield None, kg

    # -- consultas -----------------------------------------------------------

    def _tem_oferta_futura(self, erva: str, dia: date) -> bool:
        return any(
            lote.lote.erva == erva and lote.lote.data_chegada > dia and lote.saldo > _EPS
            for lote in self.lotes
        )

    def _prioridade_maxima(self, erva: str, dia: date) -> int:
        return max(
            (
                n.prioridade
                for n in self.necessidades
                if n.necessidade.erva == erva and n.necessidade.prazo >= dia and n.restante > _EPS
            ),
            default=0,
        )

    # -- pendências ----------------------------------------------------------

    def _registrar_vencidos(self, dia: date) -> None:
        for lote in self.lotes:
            if lote.saldo > _EPS and lote.vencimento < dia:
                self.resultado.pendencias.append(
                    Pendencia(
                        tipo=TipoPendencia.CAPACIDADE_EXCEDIDA,
                        mensagem=(
                            f"Lote {lote.lote.id} ({lote.lote.erva}) venceu em "
                            f"{lote.vencimento:%d/%m/%Y} com {lote.saldo:.1f} kg sem secador"
                        ),
                        erva=lote.lote.erva,
                        lote_id=lote.lote.id,
                        kg=round(lote.saldo, 3),
                    )
                )
                lote.saldo = 0.0

    def _registrar_atrasos(self) -> None:
        for n in self.necessidades:
            if n.restante > _EPS:
                self.resultado.pendencias.append(
                    Pendencia(
                        tipo=TipoPendencia.ATRASO,
                        mensagem=(
                            f"Demanda {n.necessidade.demanda_id} ({n.necessidade.erva}): "
                            f"faltam {n.restante:.1f} kg de erva fresca secos até "
                            f"{n.necessidade.prazo:%d/%m/%Y}"
                        ),
                        erva=n.necessidade.erva,
                        demanda_id=n.necessidade.demanda_id,
                        kg=round(n.restante, 3),
                    )
                )

    def _registrar_sem_oferta(self) -> None:
        necessidade: dict[str, float] = defaultdict(float)
        oferta: dict[str, float] = defaultdict(float)
        for n in self.necessidades:
            necessidade[n.necessidade.erva] += n.necessidade.kg_fresco
        for lote in self.lotes:
            oferta[lote.lote.erva] += lote.lote.kg_fresco

        for erva in sorted(necessidade):
            falta = necessidade[erva] - oferta[erva]
            if falta > _EPS:
                self.resultado.pendencias.append(
                    Pendencia(
                        tipo=TipoPendencia.SALDO_NAO_ALOCADO,
                        mensagem=(
                            f"Necessidade de {necessidade[erva]:.1f} kg de {erva} fresca, mas só há "
                            f"{oferta[erva]:.1f} kg de oferta prevista no horizonte"
                        ),
                        erva=erva,
                        kg=round(falta, 3),
                    )
                )


def _horas_secagem(capacidade: Capacidade, kg: float) -> float:
    """Horas para secar `kg`. Por carga, uma carga parcial ocupa o tempo de uma cheia."""
    if capacidade.modo == ModoCapacidade.POR_CARGA:
        return math.ceil(kg / capacidade.kg_por_carga - _EPS) * capacidade.horas_por_carga
    return kg / capacidade.kg_fresco_por_hora


def _dias(inicio: date, fim: date) -> Iterator[date]:
    dia = inicio
    while dia <= fim:
        yield dia
        dia += timedelta(days=1)


# ---------------------------------------------------------------------------
# KPIs
# ---------------------------------------------------------------------------


def _calcular_kpis(entrada: EntradaPlanejamento, resultado: ResultadoPlano) -> dict[str, object]:
    """Ocupação em horas por secador e saldo não alocado em kg por erva.

    Ocupação = (horas de secagem + setup) / (24 h × dias disponíveis). Secador
    sem nenhum dia disponível → None ("não aplicável"), nunca 0.
    Saldo não alocado = necessidade de fresco não coberta até o prazo. Fica
    separado por erva: kg de ervas diferentes não se somam.
    """
    horas_disponiveis = {
        s.codigo: HORAS_DIA
        * sum(
            1
            for dia in _dias(entrada.inicio, entrada.fim)
            if secador_disponivel(s.codigo, dia, entrada.bloqueios, entrada.dias_operacao)
        )
        for s in entrada.secadores
    }
    horas_ocupadas: dict[str, float] = {s.codigo: 0.0 for s in entrada.secadores}
    atendido: dict[str, float] = defaultdict(float)
    for a in resultado.alocacoes:
        horas_ocupadas[a.secador] += a.horas_secagem + a.horas_setup
        if a.demanda_id is not None:
            atendido[a.demanda_id] += a.kg_fresco

    saldo: dict[str, float] = defaultdict(float)
    for n in resultado.necessidades:
        saldo[n.erva] += max(0.0, n.kg_fresco - atendido[n.demanda_id])

    return {
        "horas_ocupadas": {s: round(h, 3) for s, h in horas_ocupadas.items()},
        "horas_disponiveis": horas_disponiveis,
        "ocupacao_planejada_pct": {
            s: round(100 * horas_ocupadas[s] / h, 1) if h else None
            for s, h in horas_disponiveis.items()
        },
        "saldo_nao_alocado_kg": {e: round(kg, 3) for e, kg in sorted(saldo.items())},
    }
