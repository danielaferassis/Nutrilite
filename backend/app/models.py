from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.mysql import INTEGER, TINYINT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Equivale ao DEFAULT ... ON UPDATE do MySQL: o banco atualiza a data a cada UPDATE
ATUALIZADO_EM_DEFAULT = text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(500))
    # Gravado pelo banco em UTC
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Usuario(Base):
    __tablename__ = "usuario"
    __table_args__ = (UniqueConstraint("email", name="uk_usuario_email"),)

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True)
    nome: Mapped[str] = mapped_column(String(150))
    email: Mapped[str] = mapped_column(String(150))
    senha_hash: Mapped[str] = mapped_column(String(255))  # Argon2id
    ativo: Mapped[bool] = mapped_column(Boolean, server_default=text("1"))
    ultimo_login: Mapped[datetime | None] = mapped_column(DateTime)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, server_default=ATUALIZADO_EM_DEFAULT)

    grupos: Mapped[list["Grupo"]] = relationship(secondary="usuario_grupo", back_populates="usuarios")


class Grupo(Base):
    __tablename__ = "grupo"
    __table_args__ = (UniqueConstraint("nome", name="uk_grupo_nome"),)

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True)
    nome: Mapped[str] = mapped_column(String(100))
    descricao: Mapped[str | None] = mapped_column(String(255))
    ativo: Mapped[bool] = mapped_column(Boolean, server_default=text("1"))
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, server_default=ATUALIZADO_EM_DEFAULT)

    usuarios: Mapped[list["Usuario"]] = relationship(secondary="usuario_grupo", back_populates="grupos")
    funcionalidades: Mapped[list["Funcionalidade"]] = relationship(
        secondary="grupo_funcionalidade", back_populates="grupos"
    )


class Funcionalidade(Base):
    __tablename__ = "funcionalidade"
    __table_args__ = (UniqueConstraint("codigo", name="uk_funcionalidade_codigo"),)

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True)
    codigo: Mapped[str] = mapped_column(String(100))
    nome: Mapped[str] = mapped_column(String(150))
    descricao: Mapped[str | None] = mapped_column(String(255))
    modulo: Mapped[str | None] = mapped_column(String(100))  # agrupa no menu/tela de permissões
    ativo: Mapped[bool] = mapped_column(Boolean, server_default=text("1"))
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    grupos: Mapped[list["Grupo"]] = relationship(
        secondary="grupo_funcionalidade", back_populates="funcionalidades"
    )


class UsuarioGrupo(Base):
    __tablename__ = "usuario_grupo"
    __table_args__ = (Index("idx_ug_grupo", "grupo_id"),)

    usuario_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("usuario.id", name="fk_ug_usuario", ondelete="CASCADE"),
        primary_key=True,
    )
    grupo_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("grupo.id", name="fk_ug_grupo", ondelete="CASCADE"),
        primary_key=True,
    )
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Sessao(Base):
    """Sessão de login. O navegador guarda o token no cookie; aqui fica só o hash."""

    __tablename__ = "sessao"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uk_sessao_token_hash"),
        Index("idx_sessao_usuario", "usuario_id"),
    )

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("usuario.id", name="fk_sessao_usuario", ondelete="CASCADE"),
    )
    token_hash: Mapped[str] = mapped_column(String(64))  # SHA-256 em hex
    ip: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # Gravados pela aplicação em UTC
    ultimo_uso: Mapped[datetime] = mapped_column(DateTime)
    expira_em: Mapped[datetime] = mapped_column(DateTime)

    usuario: Mapped["Usuario"] = relationship()


class GrupoFuncionalidade(Base):
    __tablename__ = "grupo_funcionalidade"
    __table_args__ = (Index("idx_gf_funcionalidade", "funcionalidade_id"),)

    grupo_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("grupo.id", name="fk_gf_grupo", ondelete="CASCADE"),
        primary_key=True,
    )
    funcionalidade_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("funcionalidade.id", name="fk_gf_funcionalidade", ondelete="CASCADE"),
        primary_key=True,
    )
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class StatusImportacao(StrEnum):
    PENDENTE = "pendente"  # na fila, esperando o worker
    PROCESSANDO = "processando"
    CONCLUIDO = "concluido"
    ERRO = "erro"
    CANCELADO = "cancelado"


class Importacao(Base):
    """Arquivo enviado para importação. A tabela também é a fila do worker."""

    __tablename__ = "importacao"
    __table_args__ = (
        Index("idx_importacao_status", "status"),
        Index("idx_importacao_sha256", "sha256"),
        Index("idx_importacao_usuario", "usuario_id"),
    )

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True)
    usuario_id: Mapped[int | None] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("usuario.id", name="fk_importacao_usuario", ondelete="SET NULL"),
    )
    tipo: Mapped[str] = mapped_column(String(50))  # chave em app/importacao/tipos.py
    nome_arquivo: Mapped[str] = mapped_column(String(255))  # nome original, só para exibir
    # Nome do arquivo no diretório de uploads; NULL depois que a retenção apaga o arquivo
    arquivo: Mapped[str | None] = mapped_column(String(100))
    tamanho_bytes: Mapped[int] = mapped_column(INTEGER(unsigned=True))
    sha256: Mapped[str] = mapped_column(String(64))
    status: Mapped[StatusImportacao] = mapped_column(
        Enum(
            StatusImportacao,
            name="status_importacao",
            values_callable=lambda enum: [membro.value for membro in enum],
        ),
        server_default=StatusImportacao.PENDENTE.value,
    )
    tentativas: Mapped[int] = mapped_column(TINYINT(unsigned=True), server_default=text("0"))
    linhas_total: Mapped[int | None] = mapped_column(INTEGER(unsigned=True))
    linhas_com_erro: Mapped[int | None] = mapped_column(INTEGER(unsigned=True))
    mensagem_erro: Mapped[str | None] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # Gravados pela aplicação em UTC
    iniciado_em: Mapped[datetime | None] = mapped_column(DateTime)
    finalizado_em: Mapped[datetime | None] = mapped_column(DateTime)

    usuario: Mapped["Usuario | None"] = relationship()

    @property
    def arquivo_disponivel(self) -> bool:
        return self.arquivo is not None


class ImportacaoErro(Base):
    """Problema numa linha do arquivo, para o usuário corrigir a planilha."""

    __tablename__ = "importacao_erro"
    __table_args__ = (Index("idx_ie_importacao", "importacao_id"),)

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True)
    importacao_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("importacao.id", name="fk_ie_importacao", ondelete="CASCADE"),
    )
    linha: Mapped[int | None] = mapped_column(INTEGER(unsigned=True))
    coluna: Mapped[str | None] = mapped_column(String(100))
    mensagem: Mapped[str] = mapped_column(String(500))
