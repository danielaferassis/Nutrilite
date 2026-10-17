"""Tipos de entrada e saída do motor de planejamento.

Este arquivo é o contrato entre as partes do motor (conversão, capacidade,
validação e alocação) e entre o motor e o resto do backend. O motor NÃO
conhece SQLAlchemy nem FastAPI: um adaptador converte os models do banco
nestes dataclasses antes de chamar `simular()`.

Convenções:
- Massas em kg e tempos em horas, sempre como float.
- Parâmetros opcionais com valor `None` significam "não informado". O motor
  nunca preenche um valor ausente por conta própria: ele gera uma
  `Pendencia` do tipo PARAM_AUSENTE.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum


class Estagio(StrEnum):
    """Estágio do produto ao longo do processo."""

    FRESCO = "fresco"  # erva in natura, como chega do campo
    DESIDRATADO = "desidratado"  # saída do secador
    MOIDO = "moido"  # produto acabado, após a moagem


class Origem(StrEnum):
    """Fontes fornecedoras de erva fresca."""

    FAZENDA_PROPRIA = "fazenda_propria"
    PROCOMPETE = "procompete"
    PD = "pd"


class TipoPendencia(StrEnum):
    """Motivos pelos quais o plano não atende algo. Sempre explicáveis na tela."""

    PARAM_AUSENTE = "param_ausente"  # falta um parâmetro necessário ao cálculo
    CAPACIDADE_EXCEDIDA = "capacidade_excedida"  # lote sem secador antes de vencer
    ATRASO = "atraso"  # demanda não coberta até o prazo
    SALDO_NAO_ALOCADO = "saldo_nao_alocado"  # necessidade sem oferta prevista


# ---------------------------------------------------------------------------
# Cadastros (parâmetros da fábrica)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Erva:
    codigo: str  # ex.: "CAMOMILA"
    nome: str
    # Horas de operação por dia. Relatório etapa 1: 24 h para agrião, picão,
    # salsa e fibra; 12 h para camomila (sem secagem noturna).
    regime_horas_dia: float | None = None
    # Quantos dias a erva fresca pode esperar entre a chegada e a secagem.
    # Pendente de confirmação com o PCP ("regra dos 15 dias").
    espera_maxima_dias: int | None = None


@dataclass(frozen=True)
class Secador:
    codigo: str  # ex.: "SCB01"
    nome: str


@dataclass(frozen=True)
class Capacidade:
    """Capacidade de um secador para uma erva específica."""

    erva: str  # Erva.codigo
    secador: str  # Secador.codigo
    kg_fresco_por_hora: float | None = None
    setup_inicial_h: float | None = None  # ao começar uma campanha da erva
    setup_final_h: float | None = None  # ao encerrar a campanha (limpeza)
    setup_diario_h: float | None = None  # perda diária durante a campanha


@dataclass(frozen=True)
class Rendimento:
    """Razões de conversão entre estágios (kg de entrada por kg de saída).

    Ex.: fresco_por_desidratado = 6.0 significa que 6 kg de erva fresca
    geram 1 kg de erva desidratada.
    """

    erva: str
    fresco_por_desidratado: float | None = None
    desidratado_por_moido: float | None = None


@dataclass(frozen=True)
class BloqueioSecador:
    """Período em que o secador não está disponível (manutenção, feriado...)."""

    secador: str
    inicio: date
    fim: date  # inclusivo
    motivo: str = ""


# ---------------------------------------------------------------------------
# Oferta e demanda
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class LotePrevisto:
    """Entrega prevista de erva fresca (uma linha da tela de previsões)."""

    id: str
    erva: str
    origem: Origem
    data_chegada: date
    kg_fresco: float


@dataclass(frozen=True)
class Demanda:
    """Meta de produção com prazo (uma linha da tela de demandas)."""

    id: str
    erva: str
    kg: float  # demanda líquida, já descontado o estoque
    estagio: Estagio  # estágio em que `kg` está expresso
    prazo: date  # data até a qual a secagem precisa estar concluída
    reserva_kg: float = 0.0  # margem adicional, no mesmo estágio de `kg`
    prioridade: int = 0  # maior = mais prioritária


@dataclass(frozen=True)
class EntradaPlanejamento:
    """Tudo o que o motor precisa para gerar um plano."""

    inicio: date
    fim: date  # inclusivo
    ervas: list[Erva]
    secadores: list[Secador]
    capacidades: list[Capacidade]
    rendimentos: list[Rendimento]
    lotes: list[LotePrevisto] = field(default_factory=list)
    demandas: list[Demanda] = field(default_factory=list)
    bloqueios: list[BloqueioSecador] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Saída
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class NecessidadeFresca:
    """Resultado da conversão de uma demanda para kg de erva fresca."""

    demanda_id: str
    erva: str
    kg_meta: float  # demanda + reserva, no estágio original
    estagio_meta: Estagio
    kg_fresco: float
    prazo: date


@dataclass(frozen=True)
class Alocacao:
    """Uma erva ocupando um secador em um dia."""

    secador: str
    erva: str
    dia: date
    kg_fresco: float
    horas_secagem: float
    horas_setup: float
    lote_id: str
    demanda_id: str | None = None


@dataclass(frozen=True)
class Pendencia:
    tipo: TipoPendencia
    mensagem: str
    erva: str | None = None
    secador: str | None = None
    lote_id: str | None = None
    demanda_id: str | None = None
    kg: float | None = None


@dataclass
class ResultadoPlano:
    necessidades: list[NecessidadeFresca] = field(default_factory=list)
    alocacoes: list[Alocacao] = field(default_factory=list)
    pendencias: list[Pendencia] = field(default_factory=list)
    # Ex.: {"ocupacao_planejada_pct": {...}, "saldo_nao_alocado_kg": {...}}.
    # Valores None = "não aplicável" (denominador zero), nunca 0.
    kpis: dict[str, object] = field(default_factory=dict)

    @property
    def viavel(self) -> bool:
        """True quando não há nenhuma pendência."""
        return not self.pendencias
