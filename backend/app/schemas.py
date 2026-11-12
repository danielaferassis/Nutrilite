from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Any

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from app.models import Estagio, ModoCapacidade, Origem, StatusImportacao, StatusPlano


def _assume_utc(value: datetime) -> datetime:
    # O MySQL devolve a data sem fuso; marcamos como UTC para o frontend converter certo
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


UtcDatetime = Annotated[datetime, AfterValidator(_assume_utc)]

def _normaliza_email(value: str) -> str:
    # Field(max_length=...) é ignorado em EmailStr, por isso o limite da coluna fica aqui
    if len(value) > 150:
        raise ValueError("deve ter no máximo 150 caracteres")
    # Minúsculo para evitar duplicados que só diferem em maiúsculas
    return value.lower()


Email = Annotated[EmailStr, AfterValidator(_normaliza_email)]
Senha = Annotated[str, Field(min_length=8, max_length=128)]


def _nao_nulo(value):
    # Nos updates parciais, omitir o campo é permitido; mandar null em coluna NOT NULL, não
    if value is None:
        raise ValueError("não pode ser nulo")
    return value


class ItemCreate(BaseModel):
    name: str
    description: str | None = None


class ItemRead(ItemCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: UtcDatetime


# --- Funcionalidades ---


class FuncionalidadeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    codigo: str
    nome: str
    descricao: str | None
    modulo: str | None
    ativo: bool


# --- Grupos ---


class GrupoCreate(BaseModel):
    nome: str = Field(min_length=1, max_length=100)
    descricao: str | None = Field(default=None, max_length=255)
    ativo: bool = True
    funcionalidade_ids: list[int] = []


class GrupoUpdate(BaseModel):
    """Atualização parcial: só os campos enviados são alterados."""

    nome: str | None = Field(default=None, min_length=1, max_length=100)
    descricao: str | None = Field(default=None, max_length=255)
    ativo: bool | None = None
    # Quando enviada, substitui a lista inteira de funcionalidades do grupo
    funcionalidade_ids: list[int] | None = None

    _valida_nao_nulos = field_validator("nome", "ativo", "funcionalidade_ids")(_nao_nulo)


class GrupoResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class GrupoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    descricao: str | None
    ativo: bool
    criado_em: UtcDatetime
    atualizado_em: UtcDatetime
    funcionalidades: list[FuncionalidadeRead]


# --- Usuários ---


class UsuarioCreate(BaseModel):
    nome: str = Field(min_length=1, max_length=150)
    email: Email
    senha: Senha
    ativo: bool = True
    grupo_ids: list[int] = []


class UsuarioUpdate(BaseModel):
    """Atualização parcial: só os campos enviados são alterados."""

    nome: str | None = Field(default=None, min_length=1, max_length=150)
    email: Email | None = None
    senha: Senha | None = None
    ativo: bool | None = None
    # Quando enviada, substitui a lista inteira de grupos do usuário
    grupo_ids: list[int] | None = None

    _valida_nao_nulos = field_validator("nome", "email", "senha", "ativo", "grupo_ids")(_nao_nulo)


class UsuarioRead(BaseModel):
    """Nunca expõe senha_hash."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    email: str
    ativo: bool
    ultimo_login: UtcDatetime | None
    criado_em: UtcDatetime
    atualizado_em: UtcDatetime
    grupos: list[GrupoResumo]


# --- Autenticação ---


class LoginRequest(BaseModel):
    email: Email
    senha: str = Field(max_length=128)


class SessaoAtual(BaseModel):
    """Usuário logado e os códigos de funcionalidade que ele pode usar."""

    usuario: UsuarioRead
    permissoes: list[str]


class AlterarSenha(BaseModel):
    senha_atual: str = Field(max_length=128)
    nova_senha: Senha


# --- Importações ---


class TipoImportacaoRead(BaseModel):
    codigo: str
    nome: str
    formatos: list[str]


class UsuarioResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str


class ImportacaoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tipo: str
    nome_arquivo: str
    tamanho_bytes: int
    status: StatusImportacao
    tentativas: int
    linhas_total: int | None
    linhas_com_erro: int | None
    mensagem_erro: str | None
    # False depois que a retenção apaga o arquivo (aí não dá mais para reprocessar)
    arquivo_disponivel: bool
    usuario: UsuarioResumo | None
    criado_em: UtcDatetime
    iniciado_em: UtcDatetime | None
    finalizado_em: UtcDatetime | None


class ImportacaoErroRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    linha: int | None
    coluna: str | None
    mensagem: str


# --- Cadastros do planejamento ---


def _codigo_canonico(value: str) -> str:
    codigo = value.strip().upper()
    if not codigo:
        raise ValueError("não pode ser vazio")
    return codigo


def _nome_limpo(value: str) -> str:
    nome = value.strip()
    if not nome:
        raise ValueError("não pode ser vazio")
    return nome


# Mesma precisão das colunas do cadastro (models.HORAS, KG, RAZAO): evita o banco arredondar calado
HorasCad = Annotated[Decimal, Field(max_digits=6, decimal_places=2)]
KgCad = Annotated[Decimal, Field(max_digits=12, decimal_places=3)]
RazaoCad = Annotated[Decimal, Field(max_digits=10, decimal_places=4)]


class ErvaCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=50)
    nome: str = Field(min_length=1, max_length=150)
    ativo: bool = True
    regime_horas_dia: HorasCad | None = Field(default=None, gt=0, le=24)
    espera_maxima_dias: int | None = Field(default=None, ge=0)

    @field_validator("codigo")
    @classmethod
    def normaliza_codigo(cls, value: str) -> str:
        return _codigo_canonico(value)

    @field_validator("nome")
    @classmethod
    def normaliza_nome(cls, value: str) -> str:
        return _nome_limpo(value)


class ErvaUpdate(BaseModel):
    """Atualização parcial. Parâmetro enviado como null volta a ser "não informado"."""

    codigo: str | None = Field(default=None, min_length=1, max_length=50)
    nome: str | None = Field(default=None, min_length=1, max_length=150)
    ativo: bool | None = None
    regime_horas_dia: HorasCad | None = Field(default=None, gt=0, le=24)
    espera_maxima_dias: int | None = Field(default=None, ge=0)

    _valida_nao_nulos = field_validator("codigo", "nome", "ativo")(_nao_nulo)

    @field_validator("codigo")
    @classmethod
    def normaliza_codigo(cls, value: str) -> str:
        return _codigo_canonico(value)

    @field_validator("nome")
    @classmethod
    def normaliza_nome(cls, value: str) -> str:
        return _nome_limpo(value)


class ErvaRead(ErvaCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    criado_em: UtcDatetime
    atualizado_em: UtcDatetime


class SecadorCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=50)
    nome: str = Field(min_length=1, max_length=150)
    ativo: bool = True

    @field_validator("codigo")
    @classmethod
    def normaliza_codigo(cls, value: str) -> str:
        return _codigo_canonico(value)

    @field_validator("nome")
    @classmethod
    def normaliza_nome(cls, value: str) -> str:
        return _nome_limpo(value)


class SecadorUpdate(BaseModel):
    """Atualização parcial: só os campos enviados são alterados."""

    codigo: str | None = Field(default=None, min_length=1, max_length=50)
    nome: str | None = Field(default=None, min_length=1, max_length=150)
    ativo: bool | None = None

    _valida_nao_nulos = field_validator("codigo", "nome", "ativo")(_nao_nulo)

    @field_validator("codigo")
    @classmethod
    def normaliza_codigo(cls, value: str) -> str:
        return _codigo_canonico(value)

    @field_validator("nome")
    @classmethod
    def normaliza_nome(cls, value: str) -> str:
        return _nome_limpo(value)


class SecadorRead(SecadorCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    criado_em: UtcDatetime
    atualizado_em: UtcDatetime


class CapacidadeCreate(BaseModel):
    erva_id: int = Field(gt=0)
    secador_id: int = Field(gt=0)
    modo: ModoCapacidade | None = None
    kg_fresco_por_hora: KgCad | None = Field(default=None, gt=0)
    kg_por_carga: KgCad | None = Field(default=None, gt=0)
    horas_por_carga: HorasCad | None = Field(default=None, gt=0)
    setup_inicial_h: HorasCad | None = Field(default=None, ge=0)
    setup_final_h: HorasCad | None = Field(default=None, ge=0)
    setup_diario_h: HorasCad | None = Field(default=None, ge=0)
    setup_dentro_do_regime: bool | None = None
    prioridade: int | None = Field(default=None, ge=0)


class CapacidadeUpdate(BaseModel):
    """Atualização parcial dos parâmetros. O par erva × secador não muda.

    Todo parâmetro aceita null: volta a ser "não informado" e a simulação
    acusa PARAM_AUSENTE, nunca assume um valor.
    """

    modo: ModoCapacidade | None = None
    kg_fresco_por_hora: KgCad | None = Field(default=None, gt=0)
    kg_por_carga: KgCad | None = Field(default=None, gt=0)
    horas_por_carga: HorasCad | None = Field(default=None, gt=0)
    setup_inicial_h: HorasCad | None = Field(default=None, ge=0)
    setup_final_h: HorasCad | None = Field(default=None, ge=0)
    setup_diario_h: HorasCad | None = Field(default=None, ge=0)
    setup_dentro_do_regime: bool | None = None
    prioridade: int | None = Field(default=None, ge=0)


class CapacidadeRead(CapacidadeCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    criado_em: UtcDatetime
    atualizado_em: UtcDatetime


class RendimentoCreate(BaseModel):
    erva_id: int = Field(gt=0)
    fresco_por_desidratado: RazaoCad | None = Field(default=None, gt=0)
    desidratado_por_moido: RazaoCad | None = Field(default=None, gt=0)


class RendimentoUpdate(BaseModel):
    """Atualização parcial. Null volta a ser "não informado". A erva não muda."""

    fresco_por_desidratado: RazaoCad | None = Field(default=None, gt=0)
    desidratado_por_moido: RazaoCad | None = Field(default=None, gt=0)


class RendimentoRead(RendimentoCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    criado_em: UtcDatetime
    atualizado_em: UtcDatetime


# --- Demanda e previsão de oferta ---

# Mesma precisão da coluna Numeric(12, 3): evita o banco arredondar calado
Kg = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=3)]
Observacao = Annotated[str | None, Field(default=None, max_length=500)]


class ErvaResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    codigo: str
    nome: str


class DemandaCreate(BaseModel):
    erva_id: int = Field(gt=0)
    # Demanda líquida (já descontado o estoque), no estágio informado
    kg: Kg
    estagio: Estagio
    prazo: date
    reserva_kg: Decimal = Field(default=Decimal(0), ge=0, max_digits=12, decimal_places=3)
    # Maior = mais prioritária
    prioridade: int = Field(default=0, ge=0)
    observacao: Observacao


class DemandaUpdate(BaseModel):
    """Atualização parcial: só os campos enviados são alterados."""

    erva_id: int | None = Field(default=None, gt=0)
    kg: Kg | None = None
    estagio: Estagio | None = None
    prazo: date | None = None
    reserva_kg: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=3)
    prioridade: int | None = Field(default=None, ge=0)
    observacao: Observacao

    _valida_nao_nulos = field_validator(
        "erva_id", "kg", "estagio", "prazo", "reserva_kg", "prioridade"
    )(_nao_nulo)


class DemandaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    erva: ErvaResumo
    kg: Decimal
    estagio: Estagio
    prazo: date
    reserva_kg: Decimal
    prioridade: int
    observacao: str | None
    criado_por: UsuarioResumo
    criado_em: UtcDatetime
    atualizado_em: UtcDatetime


class PrevisaoCreate(BaseModel):
    erva_id: int = Field(gt=0)
    origem: Origem
    data_chegada: date
    kg_fresco: Kg
    observacao: Observacao


class PrevisaoUpdate(BaseModel):
    """Atualização parcial: só os campos enviados são alterados."""

    erva_id: int | None = Field(default=None, gt=0)
    origem: Origem | None = None
    data_chegada: date | None = None
    kg_fresco: Kg | None = None
    observacao: Observacao

    _valida_nao_nulos = field_validator("erva_id", "origem", "data_chegada", "kg_fresco")(_nao_nulo)


class PrevisaoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    erva: ErvaResumo
    origem: Origem
    data_chegada: date
    kg_fresco: Decimal
    observacao: str | None
    # Com recebimento, a previsão fica travada (a tela esconde editar/excluir)
    recebida: bool
    criado_por: UsuarioResumo
    criado_em: UtcDatetime
    atualizado_em: UtcDatetime


# --- Simulação ---

# Evita uma simulação gigante travar o backend (o motor anda dia a dia)
HORIZONTE_MAXIMO_DIAS = 366


class SimulacaoRequest(BaseModel):
    inicio: date
    fim: date  # inclusivo
    # Dias da semana em que a fábrica opera (0 = segunda … 6 = domingo).
    # Omitido = não informado: o motor devolve PARAM_AUSENTE, sem supor nada.
    dias_operacao: list[Annotated[int, Field(ge=0, le=6)]] | None = None

    @model_validator(mode="after")
    def valida_horizonte(self):
        if self.fim < self.inicio:
            raise ValueError("fim não pode ser anterior ao início")
        if (self.fim - self.inicio).days + 1 > HORIZONTE_MAXIMO_DIAS:
            raise ValueError(f"horizonte máximo de {HORIZONTE_MAXIMO_DIAS} dias")
        return self


class NecessidadeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    demanda_id: str
    erva: str
    kg_meta: float
    estagio_meta: Estagio
    kg_fresco: float
    prazo: date


class AlocacaoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    secador: str
    erva: str
    dia: date
    kg_fresco: float
    horas_secagem: float
    horas_setup: float
    lote_id: str
    demanda_id: str | None


class PendenciaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tipo: str
    mensagem: str
    erva: str | None
    secador: str | None
    lote_id: str | None
    demanda_id: str | None
    kg: float | None


class SimulacaoRead(BaseModel):
    inicio: date
    fim: date
    dias_operacao: list[int] | None
    viavel: bool
    necessidades: list[NecessidadeRead]
    alocacoes: list[AlocacaoRead]
    pendencias: list[PendenciaRead]
    # Valores None = "não aplicável" (denominador zero), nunca 0
    kpis: dict[str, Any]
    # Limitações da simulação que não são pendência do motor (ex.: sem bloqueios)
    avisos: list[str]


# --- Plano salvo ---


class PlanoCreate(SimulacaoRequest):
    observacao: Observacao


class PlanoResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    versao: int
    status: StatusPlano
    inicio: date
    fim: date
    viavel: bool
    observacao: str | None
    criado_por: UsuarioResumo
    criado_em: UtcDatetime
    aprovado_por: UsuarioResumo | None
    aprovado_em: UtcDatetime | None


class PlanoRead(PlanoResumo):
    # Entrada completa usada na simulação (rastreabilidade)
    parametros: dict[str, Any]
    necessidades: list[NecessidadeRead]
    alocacoes: list[AlocacaoRead]
    pendencias: list[PendenciaRead]
    kpis: dict[str, Any]
    avisos: list[str]


# --- Bloqueio de secador ---


class SecadorResumo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    codigo: str
    nome: str


class BloqueioCreate(BaseModel):
    secador_id: int = Field(gt=0)
    inicio: date
    fim: date  # inclusivo
    motivo: str = Field(min_length=1, max_length=255)

    @field_validator("motivo")
    @classmethod
    def normaliza_motivo(cls, value: str) -> str:
        return _nome_limpo(value)

    @model_validator(mode="after")
    def valida_periodo(self):
        if self.fim < self.inicio:
            raise ValueError("fim não pode ser anterior ao início")
        return self


class BloqueioUpdate(BaseModel):
    """Atualização parcial: só os campos enviados são alterados."""

    secador_id: int | None = Field(default=None, gt=0)
    inicio: date | None = None
    fim: date | None = None
    motivo: str | None = Field(default=None, min_length=1, max_length=255)

    _valida_nao_nulos = field_validator("secador_id", "inicio", "fim", "motivo")(_nao_nulo)

    @field_validator("motivo")
    @classmethod
    def normaliza_motivo(cls, value: str) -> str:
        return _nome_limpo(value)


class BloqueioRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    secador: SecadorResumo
    inicio: date
    fim: date
    motivo: str
    criado_por: UsuarioResumo
    criado_em: UtcDatetime
    atualizado_em: UtcDatetime


# --- Recebimento e cronograma ---


class RecebimentoCreate(BaseModel):
    # Com previsão, erva e origem vêm dela. Sem previsão (chegada não prevista),
    # as duas são obrigatórias.
    previsao_id: int | None = Field(default=None, gt=0)
    erva_id: int | None = Field(default=None, gt=0)
    origem: Origem | None = None
    data_recebimento: date
    kg_fresco: Kg
    observacao: Observacao

    @model_validator(mode="after")
    def valida_vinculo(self):
        if self.previsao_id is not None and (self.erva_id is not None or self.origem is not None):
            raise ValueError("com previsão, erva e origem vêm da previsão: não informe")
        if self.previsao_id is None and (self.erva_id is None or self.origem is None):
            raise ValueError("chegada não prevista precisa de erva e origem")
        return self


class RecebimentoUpdate(BaseModel):
    """Corrige data, kg ou observação. Vínculo, erva e origem não mudam."""

    data_recebimento: date | None = None
    kg_fresco: Kg | None = None
    observacao: Observacao

    _valida_nao_nulos = field_validator("data_recebimento", "kg_fresco")(_nao_nulo)


class RecebimentoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    previsao_id: int | None
    erva: ErvaResumo
    origem: Origem
    data_recebimento: date
    kg_fresco: Decimal
    observacao: str | None
    registrado_por: UsuarioResumo
    criado_em: UtcDatetime
    atualizado_em: UtcDatetime


class AlocacaoCronograma(AlocacaoRead):
    plano_id: int
    versao: int


class ChegadaCronograma(BaseModel):
    """Uma previsão e o que chegou dela, ou uma chegada não prevista."""

    previsao_id: int | None
    erva: ErvaResumo
    origem: Origem
    data_prevista: date | None
    kg_previsto: Decimal | None
    recebimentos: list[RecebimentoRead]
    kg_recebido: Decimal
    # recebido − previsto; None enquanto não chegou ou sem previsão
    desvio_kg: Decimal | None
    # recebida | aguardando | atrasada (passou a data sem chegar) | nao_prevista
    situacao: str


class CronogramaRead(BaseModel):
    de: date
    ate: date
    hoje: date
    # Aprovados e substituídos que tocam o período (linha do tempo)
    planos: list[PlanoResumo]
    # Só dos planos aprovados (vigentes)
    alocacoes: list[AlocacaoCronograma]
    chegadas: list[ChegadaCronograma]
