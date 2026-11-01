"""cria tabela de bloqueio de secador

Revision ID: 8e3f1b6c2a90
Revises: 178ac6175da5
Create Date: 2026-11-02 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = '8e3f1b6c2a90'
down_revision: Union[str, Sequence[str], None] = '178ac6175da5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE_OPTS = {
    'mysql_engine': 'InnoDB',
    'mysql_charset': 'utf8mb4',
    'mysql_collate': 'utf8mb4_unicode_ci',
}
UNSIGNED_INT = mysql.INTEGER(unsigned=True)
ATUALIZADO_EM = sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')

# Checadas pelo router de bloqueios
FUNCIONALIDADES = [
    ('bloqueio.consultar', 'Consultar bloqueios', 'Ver os períodos em que os secadores param'),
    ('bloqueio.gerenciar', 'Gerenciar bloqueios', 'Cadastrar, alterar e remover paradas de secador'),
]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'bloqueio_secador',
        sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
        sa.Column('secador_id', UNSIGNED_INT, nullable=False),
        sa.Column('inicio', sa.Date(), nullable=False),
        sa.Column('fim', sa.Date(), nullable=False),
        sa.Column('motivo', sa.String(length=255), nullable=False),
        sa.Column('criado_por_id', UNSIGNED_INT, nullable=False),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('atualizado_em', sa.DateTime(), server_default=ATUALIZADO_EM, nullable=False),
        sa.CheckConstraint('fim >= inicio', name='ck_bloqueio_periodo'),
        sa.CheckConstraint('LENGTH(TRIM(motivo)) > 0', name='ck_bloqueio_motivo'),
        sa.ForeignKeyConstraint(['secador_id'], ['secador.id'], name='fk_bloqueio_secador', ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['criado_por_id'], ['usuario.id'], name='fk_bloqueio_criado_por', ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        **TABLE_OPTS,
    )
    op.create_index('idx_bloqueio_secador_periodo', 'bloqueio_secador', ['secador_id', 'inicio', 'fim'])

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
    # O índice sai com a tabela (o MySQL não deixa removê-lo antes da FK)
    op.drop_table('bloqueio_secador')
