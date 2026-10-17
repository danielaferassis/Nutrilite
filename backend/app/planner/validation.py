"""Validação da entrada do motor.

Regra do projeto: valores ausentes não são preenchidos silenciosamente. Cada
parâmetro faltante vira uma Pendencia PARAM_AUSENTE, que a tela mostra ao PCP.
"""

from __future__ import annotations

from app.planner.types import EntradaPlanejamento, Pendencia, TipoPendencia


def _ausente(mensagem: str, **kwargs: str | None) -> Pendencia:
    return Pendencia(tipo=TipoPendencia.PARAM_AUSENTE, mensagem=mensagem, **kwargs)


def validar_entrada(entrada: EntradaPlanejamento) -> list[Pendencia]:
    """Retorna a lista de parâmetros ausentes ou inconsistentes."""
    pendencias: list[Pendencia] = []

    if entrada.fim < entrada.inicio:
        pendencias.append(_ausente("Horizonte inválido: fim anterior ao início"))

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
            faltando = [
                nome
                for nome in ("kg_fresco_por_hora", "setup_inicial_h", "setup_final_h", "setup_diario_h")
                if getattr(cap, nome) is None
            ]
            if faltando:
                pendencias.append(
                    _ausente(
                        f"Capacidade {codigo} × {cap.secador} incompleta: {', '.join(faltando)}",
                        erva=codigo,
                        secador=cap.secador,
                    )
                )

    return pendencias
