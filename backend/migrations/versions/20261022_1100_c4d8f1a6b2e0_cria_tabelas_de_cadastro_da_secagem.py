"""cria tabelas de cadastro da secagem

Revision ID: c4d8f1a6b2e0
Revises: 9b3e7c1d2a64
Create Date: 2026-10-22 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = 'c4d8f1a6b2e0'
down_revision: Union[str, Sequence[str], None] = '9b3e7c1d2a64'
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
RAZAO = sa.Numeric(10, 4)
ATUALIZADO_EM = sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'erva',
        sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
        sa.Column('codigo', sa.String(length=50), nullable=False),
        sa.Column('nome', sa.String(length=150), nullable=False),
        sa.Column('ativo', sa.Boolean(), server_default=sa.text('1'), nullable=False),
        sa.Column('regime_horas_dia', HORAS, nullable=True),
        sa.Column('espera_maxima_dias', UNSIGNED_INT, nullable=True),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('atualizado_em', sa.DateTime(), server_default=ATUALIZADO_EM, nullable=False),
        sa.CheckConstraint('LENGTH(TRIM(codigo)) > 0', name='ck_erva_codigo'),
        sa.CheckConstraint('LENGTH(TRIM(nome)) > 0', name='ck_erva_nome'),
        sa.CheckConstraint(
            'regime_horas_dia IS NULL OR (regime_horas_dia > 0 AND regime_horas_dia <= 24)',
            name='ck_erva_regime_horas_dia',
        ),
        sa.CheckConstraint(
            'espera_maxima_dias IS NULL OR espera_maxima_dias >= 0',
            name='ck_erva_espera_maxima_dias',
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('codigo', name='uk_erva_codigo'),
        **TABLE_OPTS,
    )
    op.create_table(
        'secador',
        sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
        sa.Column('codigo', sa.String(length=50), nullable=False),
        sa.Column('nome', sa.String(length=150), nullable=False),
        sa.Column('ativo', sa.Boolean(), server_default=sa.text('1'), nullable=False),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('atualizado_em', sa.DateTime(), server_default=ATUALIZADO_EM, nullable=False),
        sa.CheckConstraint('LENGTH(TRIM(codigo)) > 0', name='ck_secador_codigo'),
        sa.CheckConstraint('LENGTH(TRIM(nome)) > 0', name='ck_secador_nome'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('codigo', name='uk_secador_codigo'),
        **TABLE_OPTS,
    )
    op.create_table(
        'capacidade',
        sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
        sa.Column('erva_id', UNSIGNED_INT, nullable=False),
        sa.Column('secador_id', UNSIGNED_INT, nullable=False),
        sa.Column(
            'modo',
            sa.Enum('continuo', 'por_carga', name='modo_capacidade'),
            nullable=True,
        ),
        sa.Column('kg_fresco_por_hora', KG, nullable=True),
        sa.Column('kg_por_carga', KG, nullable=True),
        sa.Column('horas_por_carga', HORAS, nullable=True),
        sa.Column('setup_inicial_h', HORAS, nullable=True),
        sa.Column('setup_final_h', HORAS, nullable=True),
        sa.Column('setup_diario_h', HORAS, nullable=True),
        sa.Column('setup_dentro_do_regime', sa.Boolean(), nullable=True),
        sa.Column('prioridade', UNSIGNED_INT, nullable=True),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('atualizado_em', sa.DateTime(), server_default=ATUALIZADO_EM, nullable=False),
        sa.CheckConstraint(
            'kg_fresco_por_hora IS NULL OR kg_fresco_por_hora > 0',
            name='ck_capacidade_kg_fresco_por_hora',
        ),
        sa.CheckConstraint(
            'kg_por_carga IS NULL OR kg_por_carga > 0',
            name='ck_capacidade_kg_por_carga',
        ),
        sa.CheckConstraint(
            'horas_por_carga IS NULL OR horas_por_carga > 0',
            name='ck_capacidade_horas_por_carga',
        ),
        sa.CheckConstraint(
            'setup_inicial_h IS NULL OR setup_inicial_h >= 0',
            name='ck_capacidade_setup_inicial_h',
        ),
        sa.CheckConstraint(
            'setup_final_h IS NULL OR setup_final_h >= 0',
            name='ck_capacidade_setup_final_h',
        ),
        sa.CheckConstraint(
            'setup_diario_h IS NULL OR setup_diario_h >= 0',
            name='ck_capacidade_setup_diario_h',
        ),
        sa.CheckConstraint(
            'prioridade IS NULL OR prioridade >= 0',
            name='ck_capacidade_prioridade',
        ),
        sa.ForeignKeyConstraint(['erva_id'], ['erva.id'], name='fk_capacidade_erva', ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(
            ['secador_id'], ['secador.id'], name='fk_capacidade_secador', ondelete='RESTRICT'
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('erva_id', 'secador_id', name='uk_capacidade_erva_secador'),
        **TABLE_OPTS,
    )
    op.create_index('idx_capacidade_secador', 'capacidade', ['secador_id'], unique=False)
    op.create_table(
        'rendimento',
        sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
        sa.Column('erva_id', UNSIGNED_INT, nullable=False),
        sa.Column('fresco_por_desidratado', RAZAO, nullable=True),
        sa.Column('desidratado_por_moido', RAZAO, nullable=True),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('atualizado_em', sa.DateTime(), server_default=ATUALIZADO_EM, nullable=False),
        sa.CheckConstraint(
            'fresco_por_desidratado IS NULL OR fresco_por_desidratado > 0',
            name='ck_rendimento_fresco_por_desidratado',
        ),
        sa.CheckConstraint(
            'desidratado_por_moido IS NULL OR desidratado_por_moido > 0',
            name='ck_rendimento_desidratado_por_moido',
        ),
        sa.ForeignKeyConstraint(['erva_id'], ['erva.id'], name='fk_rendimento_erva', ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('erva_id', name='uk_rendimento_erva'),
        **TABLE_OPTS,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('rendimento')
    op.drop_table('capacidade')
    op.drop_table('secador')
    op.drop_table('erva')
