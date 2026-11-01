from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
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


# ---------------------------------------------------------------------------
# Cadastros do planejamento (parâmetros da fábrica)
#
# Espelham os dataclasses de app/planner/types.py sem importar o motor.
# Campo nulo significa "não informado": o motor gera PARAM_AUSENTE.
# A conversão para esses dataclasses fica em app/cadastro.py.
# ---------------------------------------------------------------------------

# Horas (regime, setup, duração de carga), kg e razões de rendimento.
HORAS = Numeric(6, 2)
KG = Numeric(12, 3)
RAZAO = Numeric(10, 4)


class ModoCapacidade(StrEnum):
    """Mesmos valores de app.planner.types.ModoCapacidade."""

    CONTINUO = "continuo"
    POR_CARGA = "por_carga"


def _enum_capacidade(enum):
    return [membro.value for membro in enum]


class Erva(Base):
    """Erva que pode ser secada. `regime_horas_dia` é hora por dia, não dia por semana."""

    __tablename__ = "erva"
    __table_args__ = (
        UniqueConstraint("codigo", name="uk_erva_codigo"),
        CheckConstraint("LENGTH(TRIM(codigo)) > 0", name="ck_erva_codigo"),
        CheckConstraint("LENGTH(TRIM(nome)) > 0", name="ck_erva_nome"),
        CheckConstraint(
            "regime_horas_dia IS NULL OR (regime_horas_dia > 0 AND regime_horas_dia <= 24)",
            name="ck_erva_regime_horas_dia",
        ),
        CheckConstraint(
            "espera_maxima_dias IS NULL OR espera_maxima_dias >= 0",
            name="ck_erva_espera_maxima_dias",
        ),
    )

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True)
    codigo: Mapped[str] = mapped_column(String(50))
    nome: Mapped[str] = mapped_column(String(150))
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("1"))
    # Horas de operação por dia. None = não informado.
    regime_horas_dia: Mapped[Decimal | None] = mapped_column(HORAS)
    # Dias que a erva fresca pode esperar antes da secagem. None = não informado.
    espera_maxima_dias: Mapped[int | None] = mapped_column(INTEGER(unsigned=True))
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    capacidades: Mapped[list["Capacidade"]] = relationship(back_populates="erva")
    rendimento: Mapped["Rendimento | None"] = relationship(back_populates="erva")


class Secador(Base):
    """Equipamento de secagem. Código canônico do motor: SCB01, SCB02, SCB03.

    `ativo` é situação cadastral. Indisponibilidade de calendário (manutenção,
    feriado) não fica aqui: o motor chama isso de BloqueioSecador.
    """

    __tablename__ = "secador"
    __table_args__ = (
        UniqueConstraint("codigo", name="uk_secador_codigo"),
        CheckConstraint("LENGTH(TRIM(codigo)) > 0", name="ck_secador_codigo"),
        CheckConstraint("LENGTH(TRIM(nome)) > 0", name="ck_secador_nome"),
    )

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True)
    codigo: Mapped[str] = mapped_column(String(50))
    nome: Mapped[str] = mapped_column(String(150))
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("1"))
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    capacidades: Mapped[list["Capacidade"]] = relationship(back_populates="secador")


class Capacidade(Base):
    """Parâmetros de uma erva em um secador.

    Uma linha significa que o par está no cadastro. Campos nulos não são
    preenchidos com zero: faltam dados. Kg por semana e cenários de 2 a 6
    dias de operação não são colunas — o motor recalcula o dia a partir
    da vazão horária ou da carga.
    """

    __tablename__ = "capacidade"
    __table_args__ = (
        UniqueConstraint("erva_id", "secador_id", name="uk_capacidade_erva_secador"),
        Index("idx_capacidade_secador", "secador_id"),
        CheckConstraint(
            "kg_fresco_por_hora IS NULL OR kg_fresco_por_hora > 0",
            name="ck_capacidade_kg_fresco_por_hora",
        ),
        CheckConstraint(
            "kg_por_carga IS NULL OR kg_por_carga > 0",
            name="ck_capacidade_kg_por_carga",
        ),
        CheckConstraint(
            "horas_por_carga IS NULL OR horas_por_carga > 0",
            name="ck_capacidade_horas_por_carga",
        ),
        CheckConstraint(
            "setup_inicial_h IS NULL OR setup_inicial_h >= 0",
            name="ck_capacidade_setup_inicial_h",
        ),
        CheckConstraint(
            "setup_final_h IS NULL OR setup_final_h >= 0",
            name="ck_capacidade_setup_final_h",
        ),
        CheckConstraint(
            "setup_diario_h IS NULL OR setup_diario_h >= 0",
            name="ck_capacidade_setup_diario_h",
        ),
        CheckConstraint(
            "prioridade IS NULL OR prioridade >= 0",
            name="ck_capacidade_prioridade",
        ),
    )

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True)
    erva_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("erva.id", name="fk_capacidade_erva", ondelete="RESTRICT"),
    )
    secador_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("secador.id", name="fk_capacidade_secador", ondelete="RESTRICT"),
    )
    modo: Mapped[ModoCapacidade | None] = mapped_column(
        Enum(
            ModoCapacidade,
            name="modo_capacidade",
            values_callable=_enum_capacidade,
        )
    )
    # Modo continuo: kg de erva fresca por hora.
    kg_fresco_por_hora: Mapped[Decimal | None] = mapped_column(KG)
    # Modo por_carga: kg de fresco e horas de uma carga inteira.
    kg_por_carga: Mapped[Decimal | None] = mapped_column(KG)
    horas_por_carga: Mapped[Decimal | None] = mapped_column(HORAS)
    setup_inicial_h: Mapped[Decimal | None] = mapped_column(HORAS)
    setup_final_h: Mapped[Decimal | None] = mapped_column(HORAS)
    setup_diario_h: Mapped[Decimal | None] = mapped_column(HORAS)
    # None = não informado. False é valor informado (setup fora do turno).
    setup_dentro_do_regime: Mapped[bool | None] = mapped_column(Boolean)
    # Menor número = secador preferido para a erva. None = sem preferência.
    prioridade: Mapped[int | None] = mapped_column(INTEGER(unsigned=True))
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    erva: Mapped["Erva"] = relationship(back_populates="capacidades")
    secador: Mapped["Secador"] = relationship(back_populates="capacidades")


class Rendimento(Base):
    """Razões de conversão de uma erva. Uma linha vigente por erva.

    `fresco_por_desidratado`: kg de fresco para obter 1 kg desidratado.
    `desidratado_por_moido`: kg desidratado para obter 1 kg moído.
    """

    __tablename__ = "rendimento"
    __table_args__ = (
        UniqueConstraint("erva_id", name="uk_rendimento_erva"),
        CheckConstraint(
            "fresco_por_desidratado IS NULL OR fresco_por_desidratado > 0",
            name="ck_rendimento_fresco_por_desidratado",
        ),
        CheckConstraint(
            "desidratado_por_moido IS NULL OR desidratado_por_moido > 0",
            name="ck_rendimento_desidratado_por_moido",
        ),
    )

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True)
    erva_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("erva.id", name="fk_rendimento_erva", ondelete="RESTRICT"),
    )
    fresco_por_desidratado: Mapped[Decimal | None] = mapped_column(RAZAO)
    desidratado_por_moido: Mapped[Decimal | None] = mapped_column(RAZAO)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    erva: Mapped["Erva"] = relationship(back_populates="rendimento")
