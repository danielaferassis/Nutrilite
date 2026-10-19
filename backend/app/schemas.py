from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, field_validator


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
