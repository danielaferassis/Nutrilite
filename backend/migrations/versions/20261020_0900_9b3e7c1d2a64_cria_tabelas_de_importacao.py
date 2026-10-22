"""cria tabelas de importacao

Revision ID: 9b3e7c1d2a64
Revises: 5e0f2a9d7b41
Create Date: 2026-10-20 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = '9b3e7c1d2a64'
down_revision: Union[str, Sequence[str], None] = '5e0f2a9d7b41'
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
    op.create_table('importacao',
    sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
    sa.Column('usuario_id', UNSIGNED_INT, nullable=True),
    sa.Column('tipo', sa.String(length=50), nullable=False),
    sa.Column('nome_arquivo', sa.String(length=255), nullable=False),
    sa.Column('arquivo', sa.String(length=100), nullable=True),
    sa.Column('tamanho_bytes', UNSIGNED_INT, nullable=False),
    sa.Column('sha256', sa.String(length=64), nullable=False),
    sa.Column('status', sa.Enum('pendente', 'processando', 'concluido', 'erro', 'cancelado', name='status_importacao'), server_default='pendente', nullable=False),
    sa.Column('tentativas', mysql.TINYINT(unsigned=True), server_default=sa.text('0'), nullable=False),
    sa.Column('linhas_total', UNSIGNED_INT, nullable=True),
    sa.Column('linhas_com_erro', UNSIGNED_INT, nullable=True),
    sa.Column('mensagem_erro', sa.Text(), nullable=True),
    sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('iniciado_em', sa.DateTime(), nullable=True),
    sa.Column('finalizado_em', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuario.id'], name='fk_importacao_usuario', ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    **TABLE_OPTS
    )
    op.create_index('idx_importacao_status', 'importacao', ['status'], unique=False)
    op.create_index('idx_importacao_sha256', 'importacao', ['sha256'], unique=False)
    op.create_index('idx_importacao_usuario', 'importacao', ['usuario_id'], unique=False)
    op.create_table('importacao_erro',
    sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
    sa.Column('importacao_id', UNSIGNED_INT, nullable=False),
    sa.Column('linha', UNSIGNED_INT, nullable=True),
    sa.Column('coluna', sa.String(length=100), nullable=True),
    sa.Column('mensagem', sa.String(length=500), nullable=False),
    sa.ForeignKeyConstraint(['importacao_id'], ['importacao.id'], name='fk_ie_importacao', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    **TABLE_OPTS
    )
    op.create_index('idx_ie_importacao', 'importacao_erro', ['importacao_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('importacao_erro')
    op.drop_table('importacao')
