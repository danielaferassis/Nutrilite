"""cria apontamento de secagem e codigo infinity

Revision ID: 6626f0f21fe0
Revises: b7d2e5a9c814
Create Date: 2026-11-17 00:34:41.091991

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = '6626f0f21fe0'
down_revision: Union[str, Sequence[str], None] = 'b7d2e5a9c814'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('apontamento_secagem',
    sa.Column('id', mysql.INTEGER(unsigned=True), nullable=False),
    sa.Column('importacao_id', mysql.INTEGER(unsigned=True), nullable=False),
    sa.Column('secador_id', mysql.INTEGER(unsigned=True), nullable=False),
    sa.Column('erva_id', mysql.INTEGER(unsigned=True), nullable=False),
    sa.Column('data', sa.Date(), nullable=False),
    sa.Column('inicio', sa.DateTime(), nullable=False),
    sa.Column('fim', sa.DateTime(), nullable=False),
    sa.Column('duracao_min', sa.Numeric(precision=8, scale=2), nullable=False),
    sa.Column('quantidade_kg', sa.Numeric(precision=12, scale=3), nullable=False),
    sa.Column('temperatura', sa.Numeric(precision=6, scale=2), nullable=True),
    sa.Column('turno', sa.String(length=30), nullable=True),
    sa.Column('lote', sa.String(length=50), nullable=True),
    sa.Column('batch', sa.String(length=50), nullable=True),
    sa.Column('observacao', sa.String(length=500), nullable=True),
    sa.Column('linha', mysql.INTEGER(unsigned=True), nullable=False),
    sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('duracao_min >= 0', name='ck_apontamento_duracao'),
    sa.CheckConstraint('quantidade_kg >= 0', name='ck_apontamento_quantidade'),
    sa.ForeignKeyConstraint(['erva_id'], ['erva.id'], name='fk_apontamento_erva', ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['importacao_id'], ['importacao.id'], name='fk_apontamento_importacao', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['secador_id'], ['secador.id'], name='fk_apontamento_secador', ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('secador_id', 'inicio', name='uk_apontamento_secador_inicio')
    )
    op.create_index('idx_apontamento_data', 'apontamento_secagem', ['data'], unique=False)
    op.create_index('idx_apontamento_importacao', 'apontamento_secagem', ['importacao_id'], unique=False)
    op.add_column('importacao', sa.Column('linhas_ignoradas', mysql.INTEGER(unsigned=True), nullable=True))
    op.add_column('secador', sa.Column('codigo_infinity', sa.String(length=150), nullable=True))
    op.create_unique_constraint('uk_secador_codigo_infinity', 'secador', ['codigo_infinity'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('uk_secador_codigo_infinity', 'secador', type_='unique')
    op.drop_column('secador', 'codigo_infinity')
    op.drop_column('importacao', 'linhas_ignoradas')
    # Os índices saem com a tabela (o MySQL não deixa removê-los antes das FKs)
    op.drop_table('apontamento_secagem')
