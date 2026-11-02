"""cria tabela de recebimento

Revision ID: d5f3a17da9b7
Revises: 8e3f1b6c2a90
Create Date: 2026-11-02 00:42:50.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = 'd5f3a17da9b7'
down_revision: Union[str, Sequence[str], None] = '8e3f1b6c2a90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE_OPTS = {
    'mysql_engine': 'InnoDB',
    'mysql_charset': 'utf8mb4',
    'mysql_collate': 'utf8mb4_unicode_ci',
}
UNSIGNED_INT = mysql.INTEGER(unsigned=True)
KG = sa.Numeric(12, 3)
ATUALIZADO_EM = sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')

# Checadas pelo router de recebimentos
FUNCIONALIDADES = [
    ('recebimento.consultar', 'Consultar recebimentos', 'Ver a erva fresca que chegou de fato'),
    ('recebimento.registrar', 'Registrar recebimentos', 'Registrar, corrigir e remover chegadas de erva fresca'),
]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'recebimento',
        sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
        sa.Column('previsao_id', UNSIGNED_INT, nullable=True),
        sa.Column('erva_id', UNSIGNED_INT, nullable=False),
        sa.Column('origem', sa.Enum('fazenda_propria', 'procompete', 'pd', name='origem'), nullable=False),
        sa.Column('data_recebimento', sa.Date(), nullable=False),
        sa.Column('kg_fresco', KG, nullable=False),
        sa.Column('observacao', sa.String(length=500), nullable=True),
        sa.Column('registrado_por_id', UNSIGNED_INT, nullable=False),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('atualizado_em', sa.DateTime(), server_default=ATUALIZADO_EM, nullable=False),
        sa.CheckConstraint('kg_fresco > 0', name='ck_recebimento_kg_fresco'),
        sa.ForeignKeyConstraint(['previsao_id'], ['previsao_oferta.id'], name='fk_recebimento_previsao', ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['erva_id'], ['erva.id'], name='fk_recebimento_erva', ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['registrado_por_id'], ['usuario.id'], name='fk_recebimento_registrado_por', ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        **TABLE_OPTS,
    )
    op.create_index('idx_recebimento_data', 'recebimento', ['data_recebimento'])
    op.create_index('idx_recebimento_previsao', 'recebimento', ['previsao_id'])

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
    # Os índices saem com a tabela (o MySQL não deixa removê-los antes das FKs)
    op.drop_table('recebimento')
