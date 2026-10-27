"""Validação da entrada do motor.

Regra do projeto: valores ausentes não são preenchidos silenciosamente. Cada
parâmetro faltante vira uma Pendencia PARAM_AUSENTE, que a tela mostra ao PCP.
"""

from __future__ import annotations

from app.planner.types import (
    Capacidade,
    EntradaPlanejamento,
    ModoCapacidade,
    Pendencia,
    TipoPendencia,
)

_CAMPOS_COMUNS = ("setup_inicial_h", "setup_final_h", "setup_diario_h", "setup_dentro_do_regime")
_CAMPOS_POR_MODO = {
    ModoCapacidade.CONTINUO: ("kg_fresco_por_hora",),
    ModoCapacidade.POR_CARGA: ("kg_por_carga", "horas_por_carga"),
}


def _ausente(mensagem: str, **kwargs: str | None) -> Pendencia:
    return Pendencia(tipo=TipoPendencia.PARAM_AUSENTE, mensagem=mensagem, **kwargs)


def _validar_dias_operacao(dias: frozenset[int] | None) -> list[Pendencia]:
    if dias is None:
        return [_ausente("Dias de operação da fábrica não informados")]
    if not dias:
        return [_ausente("Dias de operação inválidos: nenhum dia informado")]
    invalidos = sorted(str(d) for d in dias if not isinstance(d, int) or not 0 <= d <= 6)
    if invalidos:
        return [
            _ausente(f"Dias de operação inválidos: {', '.join(invalidos)} (use 0 = segunda … 6 = domingo)")
        ]
    return []


def _validar_capacidade(cap: Capacidade) -> list[Pendencia]:
    """Exige os campos comuns e os do modo. `None` é ausente; 0 e False são valores."""
    rotulo = f"Capacidade {cap.erva} × {cap.secador}"
    if cap.modo is None:
        return [_ausente(f"{rotulo}: modo não informado", erva=cap.erva, secador=cap.secador)]

    campos = _CAMPOS_COMUNS + _CAMPOS_POR_MODO[cap.modo]
    faltando = [nome for nome in campos if getattr(cap, nome) is None]
    if faltando:
        return [
            _ausente(f"{rotulo} incompleta: {', '.join(faltando)}", erva=cap.erva, secador=cap.secador)
        ]

    if cap.modo == ModoCapacidade.POR_CARGA and (cap.kg_por_carga <= 0 or cap.horas_por_carga <= 0):
        return [
            _ausente(
                f"{rotulo} inválida: kg_por_carga e horas_por_carga devem ser maiores que zero",
                erva=cap.erva,
                secador=cap.secador,
            )
        ]
    return []


def validar_entrada(entrada: EntradaPlanejamento) -> list[Pendencia]:
    """Retorna a lista de parâmetros ausentes ou inconsistentes."""
    pendencias: list[Pendencia] = []

    if entrada.fim < entrada.inicio:
        pendencias.append(_ausente("Horizonte inválido: fim anterior ao início"))

    pendencias.extend(_validar_dias_operacao(entrada.dias_operacao))

    ervas = {e.codigo: e for e in entrada.ervas}
    secadores = {s.codigo for s in entrada.secadores}
    rendimentos = {r.erva for r in entrada.rendimentos}

    # Só exigimos parâmetros das ervas que aparecem na oferta ou na demanda.
    ervas_usadas = {lote.erva for lote in entrada.lotes} | {d.erva for d in entrada.demandas}

    for codigo in sorted(ervas_usadas):
        erva = ervas.get(codigo)
        if erva is None:
            pendencias.append(_ausente(f"Erva {codigo} não cadastrada", erva=codigo))
            continue
        if not erva.regime_horas_dia:
            pendencias.append(_ausente(f"Regime de horas/dia ausente para {codigo}", erva=codigo))
        if erva.espera_maxima_dias is None:
            pendencias.append(
                _ausente(f"Tempo máximo de espera da erva fresca ausente para {codigo}", erva=codigo)
            )
        if codigo not in rendimentos:
            pendencias.append(_ausente(f"Rendimento não cadastrado para {codigo}", erva=codigo))

        capacidades = [c for c in entrada.capacidades if c.erva == codigo]
        if not capacidades:
            pendencias.append(
                _ausente(f"Nenhum secador tem capacidade cadastrada para {codigo}", erva=codigo)
            )
        for cap in capacidades:
            if cap.secador not in secadores:
                pendencias.append(
                    _ausente(f"Secador {cap.secador} não cadastrado", erva=codigo, secador=cap.secador)
                )
                continue
            pendencias.extend(_validar_capacidade(cap))

    return pendencias
