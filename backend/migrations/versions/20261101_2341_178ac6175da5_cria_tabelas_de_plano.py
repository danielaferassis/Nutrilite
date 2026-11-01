"""cria tabelas de plano

Revision ID: 178ac6175da5
Revises: 5a2c9e7b4d18
Create Date: 2026-11-01 23:41:20.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = '178ac6175da5'
down_revision: Union[str, Sequence[str], None] = '5a2c9e7b4d18'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE_OPTS = {
    'mysql_engine': 'InnoDB',
    'mysql_charset': 'utf8mb4',
    'mysql_collate': 'utf8mb4_unicode_ci',
}
UNSIGNED_INT = mysql.INTEGER(unsigned=True)
HORAS = sa.Numeric(6, 2)
KG = sa.Numeric(12, 3)
ATUALIZADO_EM = sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')

# Checadas pelo router de planos (simular e salvar usa plano.simular, já cadastrada)
FUNCIONALIDADES = [
    ('plano.consultar', 'Consultar planos', 'Ver os planos aprovados e o cronograma'),
    ('plano.aprovar', 'Aprovar plano', 'Aprovar um plano salvo, tornando-o o vigente do horizonte'),
]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'plano',
        sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
        sa.Column('versao', UNSIGNED_INT, nullable=False),
        sa.Column(
            'status',
            sa.Enum('rascunho', 'aprovado', 'substituido', name='status_plano'),
            server_default='rascunho',
            nullable=False,
        ),
        sa.Column('inicio', sa.Date(), nullable=False),
        sa.Column('fim', sa.Date(), nullable=False),
        sa.Column('viavel', sa.Boolean(), nullable=False),
        sa.Column('parametros', sa.JSON(), nullable=False),
        sa.Column('necessidades', sa.JSON(), nullable=False),
        sa.Column('kpis', sa.JSON(), nullable=False),
        sa.Column('avisos', sa.JSON(), nullable=False),
        sa.Column('observacao', sa.String(length=500), nullable=True),
        sa.Column('criado_por_id', UNSIGNED_INT, nullable=False),
        sa.Column('aprovado_por_id', UNSIGNED_INT, nullable=True),
        sa.Column('aprovado_em', sa.DateTime(), nullable=True),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('atualizado_em', sa.DateTime(), server_default=ATUALIZADO_EM, nullable=False),
        sa.CheckConstraint('fim >= inicio', name='ck_plano_horizonte'),
        sa.ForeignKeyConstraint(['criado_por_id'], ['usuario.id'], name='fk_plano_criado_por', ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['aprovado_por_id'], ['usuario.id'], name='fk_plano_aprovado_por', ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('inicio', 'fim', 'versao', name='uk_plano_horizonte_versao'),
        **TABLE_OPTS,
    )
    op.create_index('idx_plano_status', 'plano', ['status'])

    op.create_table(
        'plano_alocacao',
        sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
        sa.Column('plano_id', UNSIGNED_INT, nullable=False),
        sa.Column('secador', sa.String(length=50), nullable=False),
        sa.Column('erva', sa.String(length=50), nullable=False),
        sa.Column('dia', sa.Date(), nullable=False),
        sa.Column('kg_fresco', KG, nullable=False),
        sa.Column('horas_secagem', HORAS, nullable=False),
        sa.Column('horas_setup', HORAS, nullable=False),
        sa.Column('lote_id', sa.String(length=50), nullable=False),
        sa.Column('demanda_id', sa.String(length=50), nullable=True),
        sa.ForeignKeyConstraint(['plano_id'], ['plano.id'], name='fk_pa_plano', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        **TABLE_OPTS,
    )
    op.create_index('idx_pa_plano_dia', 'plano_alocacao', ['plano_id', 'dia'])

    op.create_table(
        'plano_pendencia',
        sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
        sa.Column('plano_id', UNSIGNED_INT, nullable=False),
        sa.Column('tipo', sa.String(length=30), nullable=False),
        sa.Column('mensagem', sa.String(length=500), nullable=False),
        sa.Column('erva', sa.String(length=50), nullable=True),
        sa.Column('secador', sa.String(length=50), nullable=True),
        sa.Column('lote_id', sa.String(length=50), nullable=True),
        sa.Column('demanda_id', sa.String(length=50), nullable=True),
        sa.Column('kg', KG, nullable=True),
        sa.ForeignKeyConstraint(['plano_id'], ['plano.id'], name='fk_pp_plano', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        **TABLE_OPTS,
    )
    op.create_index('idx_pp_plano', 'plano_pendencia', ['plano_id'])

    funcionalidade = sa.table(
        'funcionalidade',
        sa.column('codigo', sa.String),
        sa.column('nome', sa.String),
        sa.column('descricao', sa.String),
        sa.column('modulo', sa.String),
    )
    op.bulk_insert(
        funcionalidade,
        [
            {'codigo': codigo, 'nome': nome, 'descricao': descricao, 'modulo': 'planejamento'}
            for codigo, nome, descricao in FUNCIONALIDADES
        ],
    )


def downgrade() -> None:
    """Downgrade schema."""
    codigos = ', '.join(f"'{codigo}'" for codigo, _, _ in FUNCIONALIDADES)
    # grupo_funcionalidade tem ON DELETE CASCADE: os vínculos com grupos saem junto
    op.execute(f'DELETE FROM funcionalidade WHERE codigo IN ({codigos})')
    # Os índices saem com as tabelas (o MySQL não deixa removê-los antes das FKs)
    op.drop_table('plano_pendencia')
    op.drop_table('plano_alocacao')
    op.drop_table('plano')
