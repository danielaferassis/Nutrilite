"""cria tabela sessao

Revision ID: 5e0f2a9d7b41
Revises: c3cd1bbebf81
Create Date: 2026-10-19 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = '5e0f2a9d7b41'
down_revision: Union[str, Sequence[str], None] = 'c3cd1bbebf81'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE_OPTS = {
    'mysql_engine': 'InnoDB',
    'mysql_charset': 'utf8mb4',
    'mysql_collate': 'utf8mb4_unicode_ci',
}
UNSIGNED_INT = mysql.INTEGER(unsigned=True)


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('sessao',
    sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
    sa.Column('usuario_id', UNSIGNED_INT, nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('ip', sa.String(length=45), nullable=True),
    sa.Column('user_agent', sa.String(length=255), nullable=True),
    sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('ultimo_uso', sa.DateTime(), nullable=False),
    sa.Column('expira_em', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuario.id'], name='fk_sessao_usuario', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash', name='uk_sessao_token_hash'),
    **TABLE_OPTS
    )
    op.create_index('idx_sessao_usuario', 'sessao', ['usuario_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_sessao_usuario', table_name='sessao')
    op.drop_table('sessao')
