from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.mysql import INTEGER
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
