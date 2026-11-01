from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    JSON,
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


def _valores_do_enum(enum):
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
            values_callable=_valores_do_enum,
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


# ---------------------------------------------------------------------------
# Demanda e oferta prevista
#
# Espelham Demanda e LotePrevisto de app/planner/types.py. Quantidades em kg,
# no estágio informado (demanda) ou sempre de erva fresca (previsão).
# ---------------------------------------------------------------------------


class Estagio(StrEnum):
    """Mesmos valores de app.planner.types.Estagio."""

    FRESCO = "fresco"
    DESIDRATADO = "desidratado"
    MOIDO = "moido"


class Origem(StrEnum):
    """Mesmos valores de app.planner.types.Origem."""

    FAZENDA_PROPRIA = "fazenda_propria"
    PROCOMPETE = "procompete"
    PD = "pd"


class Demanda(Base):
    """Meta de produção de uma erva com prazo.

    `kg` é a demanda líquida (já descontado o estoque), no `estagio` informado.
    O motor converte para kg de fresco pelos rendimentos.
    """

    __tablename__ = "demanda"
    __table_args__ = (
        Index("idx_demanda_erva_prazo", "erva_id", "prazo"),
        CheckConstraint("kg > 0", name="ck_demanda_kg"),
        CheckConstraint("reserva_kg >= 0", name="ck_demanda_reserva_kg"),
    )

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True)
    erva_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("erva.id", name="fk_demanda_erva", ondelete="RESTRICT"),
    )
    kg: Mapped[Decimal] = mapped_column(KG)
    estagio: Mapped[Estagio] = mapped_column(
        Enum(Estagio, name="estagio", values_callable=_valores_do_enum)
    )
    # Data até a qual a secagem precisa estar concluída
    prazo: Mapped[date] = mapped_column(Date)
    # Margem adicional, no mesmo estágio de `kg`. Zero é valor informado.
    reserva_kg: Mapped[Decimal] = mapped_column(KG, server_default=text("0"))
    # Maior = mais prioritária
    prioridade: Mapped[int] = mapped_column(INTEGER(unsigned=True), server_default=text("0"))
    observacao: Mapped[str | None] = mapped_column(String(500))
    criado_por_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("usuario.id", name="fk_demanda_criado_por", ondelete="RESTRICT"),
    )
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    erva: Mapped["Erva"] = relationship()
    criado_por: Mapped["Usuario"] = relationship()


class PrevisaoOferta(Base):
    """Entrega prevista de erva fresca (lote). A data não é reagendável.

    `criado_por_id` é o dono da previsão: o perfil Fonte fornecedora só vê e
    altera as que ele mesmo cadastrou.
    """

    __tablename__ = "previsao_oferta"
    __table_args__ = (
        Index("idx_previsao_erva_chegada", "erva_id", "data_chegada"),
        Index("idx_previsao_criado_por", "criado_por_id"),
        CheckConstraint("kg_fresco > 0", name="ck_previsao_kg_fresco"),
    )

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True)
    erva_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("erva.id", name="fk_previsao_erva", ondelete="RESTRICT"),
    )
    origem: Mapped[Origem] = mapped_column(
        Enum(Origem, name="origem", values_callable=_valores_do_enum)
    )
    data_chegada: Mapped[date] = mapped_column(Date)
    kg_fresco: Mapped[Decimal] = mapped_column(KG)
    observacao: Mapped[str | None] = mapped_column(String(500))
    criado_por_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("usuario.id", name="fk_previsao_criado_por", ondelete="RESTRICT"),
    )
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    erva: Mapped["Erva"] = relationship()
    criado_por: Mapped["Usuario"] = relationship()


# ---------------------------------------------------------------------------
# Plano de secagem salvo
#
# Fotografia de uma simulação: guarda a entrada usada e o resultado. Erva,
# secador, lote e demanda ficam como texto (código/id), sem FK: alterar ou
# remover o cadastro depois não pode mudar um plano já aprovado.
# ---------------------------------------------------------------------------


class StatusPlano(StrEnum):
    RASCUNHO = "rascunho"  # salvo para análise, ainda não vale
    APROVADO = "aprovado"  # plano vigente para o horizonte
    SUBSTITUIDO = "substituido"  # era aprovado; outro aprovado cobriu o horizonte


class Plano(Base):
    """Plano salvo. `versao` conta os planos do mesmo horizonte (inicio, fim)."""

    __tablename__ = "plano"
    __table_args__ = (
        UniqueConstraint("inicio", "fim", "versao", name="uk_plano_horizonte_versao"),
        Index("idx_plano_status", "status"),
        CheckConstraint("fim >= inicio", name="ck_plano_horizonte"),
    )

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True)
    versao: Mapped[int] = mapped_column(INTEGER(unsigned=True))
    status: Mapped[StatusPlano] = mapped_column(
        Enum(StatusPlano, name="status_plano", values_callable=_valores_do_enum),
        server_default=StatusPlano.RASCUNHO.value,
    )
    inicio: Mapped[date] = mapped_column(Date)
    fim: Mapped[date] = mapped_column(Date)
    viavel: Mapped[bool] = mapped_column(Boolean)
    # EntradaPlanejamento usada, inteira (cadastro, demandas, lotes, dias de operação)
    parametros: Mapped[dict] = mapped_column(JSON)
    necessidades: Mapped[list] = mapped_column(JSON)
    kpis: Mapped[dict] = mapped_column(JSON)
    avisos: Mapped[list] = mapped_column(JSON)
    observacao: Mapped[str | None] = mapped_column(String(500))
    criado_por_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("usuario.id", name="fk_plano_criado_por", ondelete="RESTRICT"),
    )
    aprovado_por_id: Mapped[int | None] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("usuario.id", name="fk_plano_aprovado_por", ondelete="RESTRICT"),
    )
    # Gravado pela aplicação em UTC
    aprovado_em: Mapped[datetime | None] = mapped_column(DateTime)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    criado_por: Mapped["Usuario"] = relationship(foreign_keys=[criado_por_id])
    aprovado_por: Mapped["Usuario | None"] = relationship(foreign_keys=[aprovado_por_id])
    alocacoes: Mapped[list["PlanoAlocacao"]] = relationship(
        cascade="all, delete-orphan",
        order_by="(PlanoAlocacao.dia, PlanoAlocacao.secador, PlanoAlocacao.id)",
    )
    pendencias: Mapped[list["PlanoPendencia"]] = relationship(
        cascade="all, delete-orphan", order_by="PlanoPendencia.id"
    )


class PlanoAlocacao(Base):
    """Uma erva ocupando um secador em um dia (linha do cronograma)."""

    __tablename__ = "plano_alocacao"
    __table_args__ = (Index("idx_pa_plano_dia", "plano_id", "dia"),)

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True)
    plano_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("plano.id", name="fk_pa_plano", ondelete="CASCADE"),
    )
    secador: Mapped[str] = mapped_column(String(50))  # Secador.codigo
    erva: Mapped[str] = mapped_column(String(50))  # Erva.codigo
    dia: Mapped[date] = mapped_column(Date)
    kg_fresco: Mapped[Decimal] = mapped_column(KG)
    horas_secagem: Mapped[Decimal] = mapped_column(HORAS)
    horas_setup: Mapped[Decimal] = mapped_column(HORAS)
    lote_id: Mapped[str] = mapped_column(String(50))  # PrevisaoOferta.id
    demanda_id: Mapped[str | None] = mapped_column(String(50))  # Demanda.id


class PlanoPendencia(Base):
    """Motivo pelo qual o plano não atende algo."""

    __tablename__ = "plano_pendencia"
    __table_args__ = (Index("idx_pp_plano", "plano_id"),)

    id: Mapped[int] = mapped_column(INTEGER(unsigned=True), primary_key=True)
    plano_id: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        ForeignKey("plano.id", name="fk_pp_plano", ondelete="CASCADE"),
    )
    tipo: Mapped[str] = mapped_column(String(30))  # app.planner.types.TipoPendencia
    mensagem: Mapped[str] = mapped_column(String(500))
    erva: Mapped[str | None] = mapped_column(String(50))
    secador: Mapped[str | None] = mapped_column(String(50))
    lote_id: Mapped[str | None] = mapped_column(String(50))
    demanda_id: Mapped[str | None] = mapped_column(String(50))
    kg: Mapped[Decimal | None] = mapped_column(KG)
