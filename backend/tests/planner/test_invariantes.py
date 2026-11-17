"""Invariantes do motor em cenários aleatórios (QA, 17/11/2026).

Os testes de cenário conferem casos escolhidos a dedo. Aqui são centenas de
cenários sorteados com semente fixa (reprodutíveis) e, em cada um, regras que
valem para QUALQUER plano: horas do dia, regime, lotes, prazos, KPIs. Um bug
novo de ordenação, capacidade ou contagem tende a quebrar alguma delas mesmo
sem ninguém ter pensado no cenário exato.

Falhou? A mensagem traz a semente: `cenario(<semente>)` refaz a entrada.
"""

import math
import random
from collections import defaultdict
from datetime import date, timedelta

import pytest

from app.planner import simular
from app.planner.capacity import secador_disponivel
from app.planner.types import (
    BloqueioSecador,
    Capacidade,
    Demanda,
    EntradaPlanejamento,
    Erva,
    Estagio,
    LotePrevisto,
    ModoCapacidade,
    Origem,
    Rendimento,
    Secador,
    TipoPendencia,
)

SEMENTES = range(300)
EPS = 1e-3  # kg e horas saem arredondados em 3 casas


def cenario(semente: int) -> EntradaPlanejamento:
    rng = random.Random(semente)
    inicio = date(2026, 11, 2) + timedelta(days=rng.randint(0, 6))
    fim = inicio + timedelta(days=rng.randint(0, 13))
    ervas = [
        Erva(f"E{i}", f"Erva {i}", regime_horas_dia=rng.choice([8, 12, 24, 24]),
             espera_maxima_dias=rng.randint(0, 4))
        for i in range(rng.randint(1, 4))
    ]
    secadores = [Secador(f"S{i}", f"Secador {i}") for i in range(rng.randint(1, 3))]
    capacidades = []
    for erva in ervas:
        for secador in secadores:
            if rng.random() < 0.3:
                continue
            comum = dict(
                setup_inicial_h=rng.choice([0, 1, 2, 3]), setup_final_h=rng.choice([0, 1, 2, 4]),
                setup_diario_h=rng.choice([0, 0.5, 1]), setup_dentro_do_regime=rng.random() < 0.7,
                prioridade=rng.choice([None, None, 0, 1, 2]),
            )
            if rng.random() < 0.5:
                capacidades.append(Capacidade(
                    erva.codigo, secador.codigo, modo=ModoCapacidade.CONTINUO,
                    kg_fresco_por_hora=rng.choice([15, 40, 100]), **comum,
                ))
            else:
                capacidades.append(Capacidade(
                    erva.codigo, secador.codigo, modo=ModoCapacidade.POR_CARGA,
                    kg_por_carga=rng.choice([60, 100, 150]), horas_por_carga=rng.choice([1.5, 3, 4]),
                    **comum,
                ))
    dias = (fim - inicio).days + 1
    lotes = [
        LotePrevisto(
            f"L{i}", rng.choice(ervas).codigo, rng.choice(list(Origem)),
            inicio + timedelta(days=rng.randint(-3, dias - 1)),
            float(rng.choice([50, 120, 300, 800, 2000])),
        )
        for i in range(rng.randint(0, 10))
    ]
    demandas = [
        Demanda(
            f"D{i}", rng.choice(ervas).codigo, float(rng.choice([10, 40, 150])),
            rng.choice(list(Estagio)), inicio + timedelta(days=rng.randint(-1, dias + 3)),
            reserva_kg=rng.choice([0.0, 0.0, 5.0]), prioridade=rng.randint(0, 2),
        )
        for i in range(rng.randint(0, 6))
    ]
    bloqueios = [
        BloqueioSecador(rng.choice(secadores).codigo, d, d + timedelta(days=rng.randint(0, 2)))
        for d in (inicio + timedelta(days=rng.randint(0, dias)) for _ in range(rng.randint(0, 2)))
    ]
    dias_operacao = frozenset(rng.sample(range(7), rng.randint(4, 7)))
    rendimentos = [Rendimento(e.codigo, rng.choice([4, 6, 10]), rng.choice([1, 1.25])) for e in ervas]
    return EntradaPlanejamento(
        inicio, fim, ervas, secadores, capacidades, rendimentos,
        lotes, demandas, bloqueios, dias_operacao,
    )


def vencimento(entrada, lote) -> date:
    erva = next(e for e in entrada.ervas if e.codigo == lote.erva)
    return lote.data_chegada + timedelta(days=erva.espera_maxima_dias)


@pytest.mark.parametrize("semente", SEMENTES)
def test_invariantes_do_plano(semente):
    entrada = cenario(semente)
    r = simular(entrada)
    ervas = {e.codigo: e for e in entrada.ervas}
    caps = {(c.erva, c.secador): c for c in entrada.capacidades}
    lotes = {lote.id: lote for lote in entrada.lotes}
    msg = f"semente {semente}"

    # Determinismo: mesma entrada, mesmo plano
    assert simular(entrada) == r, msg

    incompletas = {p.erva for p in r.pendencias if p.tipo == TipoPendencia.PARAM_AUSENTE}
    if None in incompletas:
        assert not r.alocacoes, msg
        return

    horas_dia = defaultdict(float)  # (secador, dia)
    # (secador, dia, erva) → kg, horas de secagem, horas de setup, nº de linhas
    por_erva_dia = defaultdict(lambda: [0.0, 0.0, 0.0, 0])
    kg_lote = defaultdict(float)
    kg_demanda = defaultdict(float)
    for a in r.alocacoes:
        assert a.erva not in incompletas, f"{msg}: erva incompleta alocada"
        assert (a.erva, a.secador) in caps, f"{msg}: {a.secador} sem capacidade para {a.erva}"
        assert secador_disponivel(a.secador, a.dia, entrada.bloqueios, entrada.dias_operacao), (
            f"{msg}: {a.secador} alocado em dia bloqueado ou sem operação ({a.dia})"
        )
        assert entrada.inicio <= a.dia <= entrada.fim, msg
        assert a.kg_fresco > 0 and a.horas_secagem >= 0 and a.horas_setup >= 0, msg
        lote = lotes[a.lote_id]
        assert lote.erva == a.erva, msg
        assert lote.data_chegada <= a.dia <= vencimento(entrada, lote), (
            f"{msg}: lote {lote.id} seco fora da janela chegada–vencimento"
        )
        horas_dia[a.secador, a.dia] += a.horas_secagem + a.horas_setup
        acumulado = por_erva_dia[a.secador, a.dia, a.erva]
        acumulado[0] += a.kg_fresco
        acumulado[1] += a.horas_secagem
        acumulado[2] += a.horas_setup
        acumulado[3] += 1
        kg_lote[a.lote_id] += a.kg_fresco
        if a.demanda_id is not None:
            kg_demanda[a.demanda_id] += a.kg_fresco

    # Horas: dia de 24 h, regime da erva, cargas inteiras
    for (secador, dia), horas in horas_dia.items():
        assert horas <= 24 + EPS, f"{msg}: {secador} com {horas} h em {dia}"
    for (secador, dia, erva), (kg, secagem, setup, linhas) in por_erva_dia.items():
        cap = caps[erva, secador]
        regime = ervas[erva].regime_horas_dia
        usado = secagem + setup if cap.setup_dentro_do_regime else secagem
        assert usado <= regime + EPS, f"{msg}: {erva} em {secador} passou do regime em {dia}"
        if cap.modo == ModoCapacidade.POR_CARGA:
            cargas = secagem / cap.horas_por_carga
            assert abs(cargas - round(cargas)) < EPS, f"{msg}: carga fracionada em {secador} {dia}"
            assert kg <= round(cargas) * cap.kg_por_carga + EPS, f"{msg}: carga acima do kg_por_carga"
        else:
            # Cada linha guarda as horas em 3 casas: até 0,001 h de folga por linha
            folga = EPS * linhas * cap.kg_fresco_por_hora
            assert kg <= secagem * cap.kg_fresco_por_hora + folga, f"{msg}: acima da vazão"

    # Lotes: nada some nem aparece. Todo kg é seco ou vira perda se vence no horizonte.
    perdido = defaultdict(float)
    for p in r.pendencias:
        if p.tipo == TipoPendencia.CAPACIDADE_EXCEDIDA:
            perdido[p.lote_id] += p.kg
    for lote in entrada.lotes:
        if lote.erva in incompletas:
            assert kg_lote[lote.id] == 0 and perdido[lote.id] == 0, msg
            continue
        entra = lote.data_chegada <= entrada.fim and vencimento(entrada, lote) >= entrada.inicio
        assert kg_lote[lote.id] <= lote.kg_fresco + EPS, f"{msg}: lote {lote.id} seco além do kg"
        if entra and vencimento(entrada, lote) <= entrada.fim:
            assert math.isclose(kg_lote[lote.id] + perdido[lote.id], lote.kg_fresco, abs_tol=EPS), (
                f"{msg}: lote {lote.id} não fecha (seco + perdido ≠ kg)"
            )

    # Demandas: não recebe além da necessidade nem depois do prazo; atraso = falta
    necessidades = {n.demanda_id: n for n in r.necessidades}
    atrasos = {p.demanda_id: p.kg for p in r.pendencias if p.tipo == TipoPendencia.ATRASO}
    for a in r.alocacoes:
        if a.demanda_id is not None:
            assert a.dia <= necessidades[a.demanda_id].prazo, f"{msg}: kg entregue após o prazo"
    for demanda_id, n in necessidades.items():
        assert n.erva not in incompletas, msg
        assert kg_demanda[demanda_id] <= n.kg_fresco + EPS, f"{msg}: {demanda_id} recebeu demais"
        falta = n.kg_fresco - kg_demanda[demanda_id]
        if entrada.inicio <= n.prazo <= entrada.fim and falta > EPS:
            assert math.isclose(atrasos.get(demanda_id, 0), falta, abs_tol=EPS), (
                f"{msg}: atraso de {demanda_id} não bate com a falta"
            )
        if falta <= EPS:
            assert demanda_id not in atrasos, f"{msg}: atraso em demanda atendida"

    # KPIs: horas fecham com as alocações; denominador zero → None, nunca 0
    kpis = r.kpis
    for s in entrada.secadores:
        ocupadas = sum(h for (sec, _), h in horas_dia.items() if sec == s.codigo)
        assert math.isclose(kpis["horas_ocupadas"][s.codigo], ocupadas, abs_tol=EPS), msg
        disponiveis = kpis["horas_disponiveis"][s.codigo]
        pct = kpis["ocupacao_planejada_pct"][s.codigo]
        if disponiveis == 0:
            assert pct is None, f"{msg}: ocupação sem dia disponível deve ser None"
        else:
            assert 0 <= pct <= 100 + 0.05, f"{msg}: ocupação {pct}%"
    for erva, kg in kpis["saldo_nao_alocado_kg"].items():
        assert kg >= 0, msg


@pytest.mark.parametrize("semente", SEMENTES)
def test_lote_perdido_nao_cede_secador_para_erva_que_podia_esperar(semente):
    """Generaliza o bug de ordenação (A1 do relatório de QA): se um lote venceu
    com saldo, no último dia dele nenhum secador capaz para a erva pode ter sido
    dado a uma erva que podia esperar. Exceções do desenho do guloso:
    secador com campanha de outra erva aberta desde a véspera, ou sem horas
    para secar nada da erva urgente."""
    entrada = cenario(semente)
    r = simular(entrada)
    if any(p.tipo == TipoPendencia.PARAM_AUSENTE for p in r.pendencias):
        return
    lotes = {lote.id: lote for lote in entrada.lotes}
    ervas = {e.codigo: e for e in entrada.ervas}
    no_dia = defaultdict(list)  # (secador, dia) → alocações
    for a in r.alocacoes:
        no_dia[a.secador, a.dia].append(a)
    for p in r.pendencias:
        if p.tipo != TipoPendencia.CAPACIDADE_EXCEDIDA:
            continue
        perdido = lotes[p.lote_id]
        ultimo_dia = vencimento(entrada, perdido)
        if not entrada.inicio <= ultimo_dia <= entrada.fim:
            continue
        for cap in entrada.capacidades:
            if cap.erva != perdido.erva:
                continue
            vespera = {a.erva for a in no_dia[cap.secador, ultimo_dia - timedelta(days=1)]}
            if vespera - {perdido.erva}:
                continue  # campanha de outra erva pode estar aberta desde ontem
            setup = cap.setup_inicial_h + cap.setup_diario_h + cap.setup_final_h
            regime = ervas[perdido.erva].regime_horas_dia
            uteis = regime - setup if cap.setup_dentro_do_regime else min(regime, 24 - setup)
            minimo = cap.horas_por_carga if cap.modo == ModoCapacidade.POR_CARGA else EPS
            if uteis < minimo:
                continue  # nem um dia limpo comporta a erva urgente nesse secador
            # Duas ervas urgentes disputando o secador é escolha legítima: a que
            # ocupou o secador precisa ter secado nele algum lote que vencia até hoje
            # (o saldo da erva vai em bloco, do lote que vence primeiro ao último).
            urgentes = {
                a.erva for a in no_dia[cap.secador, ultimo_dia]
                if vencimento(entrada, lotes[a.lote_id]) <= ultimo_dia
            }
            for a in no_dia[cap.secador, ultimo_dia]:
                assert a.erva in urgentes, (
                    f"semente {semente}: lote {perdido.id} ({perdido.erva}) venceu em "
                    f"{ultimo_dia}, mas {cap.secador} secou {a.erva} do lote {a.lote_id}, "
                    "que podia esperar"
                )
