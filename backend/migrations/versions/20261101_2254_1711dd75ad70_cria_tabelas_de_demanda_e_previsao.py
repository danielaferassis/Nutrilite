"""cria tabelas de demanda e previsao de oferta

Revision ID: 1711dd75ad70
Revises: c4d8f1a6b2e0
Create Date: 2026-11-01 22:54:16.390706

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = '1711dd75ad70'
down_revision: Union[str, Sequence[str], None] = 'c4d8f1a6b2e0'
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

# Permissões checadas pelos routers de demanda e previsão
FUNCIONALIDADES = [
    ('demanda.consultar', 'Consultar demandas', 'Ver as metas de produção'),
    ('demanda.gerenciar', 'Gerenciar demandas', 'Cadastrar, alterar e remover metas de produção'),
    ('previsao.consultar', 'Consultar previsões', 'Ver as previsões de oferta de todas as fontes'),
    ('previsao.gerenciar', 'Gerenciar previsões', 'Cadastrar, alterar e remover qualquer previsão de oferta'),
    ('previsao.propria', 'Previsões próprias', 'Fonte fornecedora: cadastrar e manter só as próprias previsões'),
]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'demanda',
        sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
        sa.Column('erva_id', UNSIGNED_INT, nullable=False),
        sa.Column('kg', KG, nullable=False),
        sa.Column('estagio', sa.Enum('fresco', 'desidratado', 'moido', name='estagio'), nullable=False),
        sa.Column('prazo', sa.Date(), nullable=False),
        sa.Column('reserva_kg', KG, server_default=sa.text('0'), nullable=False),
        sa.Column('prioridade', UNSIGNED_INT, server_default=sa.text('0'), nullable=False),
        sa.Column('observacao', sa.String(length=500), nullable=True),
        sa.Column('criado_por_id', UNSIGNED_INT, nullable=False),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('atualizado_em', sa.DateTime(), server_default=ATUALIZADO_EM, nullable=False),
        sa.CheckConstraint('kg > 0', name='ck_demanda_kg'),
        sa.CheckConstraint('reserva_kg >= 0', name='ck_demanda_reserva_kg'),
        sa.ForeignKeyConstraint(['erva_id'], ['erva.id'], name='fk_demanda_erva', ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['criado_por_id'], ['usuario.id'], name='fk_demanda_criado_por', ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        **TABLE_OPTS,
    )
    op.create_index('idx_demanda_erva_prazo', 'demanda', ['erva_id', 'prazo'])

    op.create_table(
        'previsao_oferta',
        sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
        sa.Column('erva_id', UNSIGNED_INT, nullable=False),
        sa.Column('origem', sa.Enum('fazenda_propria', 'procompete', 'pd', name='origem'), nullable=False),
        sa.Column('data_chegada', sa.Date(), nullable=False),
        sa.Column('kg_fresco', KG, nullable=False),
        sa.Column('observacao', sa.String(length=500), nullable=True),
        sa.Column('criado_por_id', UNSIGNED_INT, nullable=False),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('atualizado_em', sa.DateTime(), server_default=ATUALIZADO_EM, nullable=False),
        sa.CheckConstraint('kg_fresco > 0', name='ck_previsao_kg_fresco'),
        sa.ForeignKeyConstraint(['erva_id'], ['erva.id'], name='fk_previsao_erva', ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['criado_por_id'], ['usuario.id'], name='fk_previsao_criado_por', ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        **TABLE_OPTS,
    )
    op.create_index('idx_previsao_erva_chegada', 'previsao_oferta', ['erva_id', 'data_chegada'])
    op.create_index('idx_previsao_criado_por', 'previsao_oferta', ['criado_por_id'])

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
    op.drop_table('previsao_oferta')
    op.drop_table('demanda')
