from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models import ModoCapacidade, StatusImportacao


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


class ErvaCreate(BaseModel):
    codigo: str = Field(min_length=1, max_length=50)
    nome: str = Field(min_length=1, max_length=150)
    ativo: bool = True
    regime_horas_dia: Decimal | None = Field(default=None, gt=0, le=24)
    espera_maxima_dias: int | None = Field(default=None, ge=0)

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


class SecadorRead(SecadorCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    criado_em: UtcDatetime
    atualizado_em: UtcDatetime


class CapacidadeCreate(BaseModel):
    erva_id: int = Field(gt=0)
    secador_id: int = Field(gt=0)
    modo: ModoCapacidade | None = None
    kg_fresco_por_hora: Decimal | None = Field(default=None, gt=0)
    kg_por_carga: Decimal | None = Field(default=None, gt=0)
    horas_por_carga: Decimal | None = Field(default=None, gt=0)
    setup_inicial_h: Decimal | None = Field(default=None, ge=0)
    setup_final_h: Decimal | None = Field(default=None, ge=0)
    setup_diario_h: Decimal | None = Field(default=None, ge=0)
    setup_dentro_do_regime: bool | None = None
    prioridade: int | None = Field(default=None, ge=0)


class CapacidadeRead(CapacidadeCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    criado_em: UtcDatetime
    atualizado_em: UtcDatetime


class RendimentoCreate(BaseModel):
    erva_id: int = Field(gt=0)
    fresco_por_desidratado: Decimal | None = Field(default=None, gt=0)
    desidratado_por_moido: Decimal | None = Field(default=None, gt=0)


class RendimentoRead(RendimentoCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    criado_em: UtcDatetime
    atualizado_em: UtcDatetime
