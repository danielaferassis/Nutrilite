"""cria tabelas de controle de acesso

Revision ID: c3cd1bbebf81
Revises: cb421131478a
Create Date: 2026-10-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = 'c3cd1bbebf81'
down_revision: Union[str, Sequence[str], None] = 'cb421131478a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE_OPTS = {
    'mysql_engine': 'InnoDB',
    'mysql_charset': 'utf8mb4',
    'mysql_collate': 'utf8mb4_unicode_ci',
}
UNSIGNED_INT = mysql.INTEGER(unsigned=True)
ATUALIZADO_EM_DEFAULT = sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('usuario',
    sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
    sa.Column('nome', sa.String(length=150), nullable=False),
    sa.Column('email', sa.String(length=150), nullable=False),
    sa.Column('senha_hash', sa.String(length=255), nullable=False),
    sa.Column('ativo', sa.Boolean(), server_default=sa.text('1'), nullable=False),
    sa.Column('ultimo_login', sa.DateTime(), nullable=True),
    sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('atualizado_em', sa.DateTime(), server_default=ATUALIZADO_EM_DEFAULT, nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email', name='uk_usuario_email'),
    **TABLE_OPTS
    )
    op.create_table('grupo',
    sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
    sa.Column('nome', sa.String(length=100), nullable=False),
    sa.Column('descricao', sa.String(length=255), nullable=True),
    sa.Column('ativo', sa.Boolean(), server_default=sa.text('1'), nullable=False),
    sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('atualizado_em', sa.DateTime(), server_default=ATUALIZADO_EM_DEFAULT, nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('nome', name='uk_grupo_nome'),
    **TABLE_OPTS
    )
    op.create_table('funcionalidade',
    sa.Column('id', UNSIGNED_INT, autoincrement=True, nullable=False),
    sa.Column('codigo', sa.String(length=100), nullable=False),
    sa.Column('nome', sa.String(length=150), nullable=False),
    sa.Column('descricao', sa.String(length=255), nullable=True),
    sa.Column('modulo', sa.String(length=100), nullable=True),
    sa.Column('ativo', sa.Boolean(), server_default=sa.text('1'), nullable=False),
    sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('codigo', name='uk_funcionalidade_codigo'),
    **TABLE_OPTS
    )
    op.create_table('usuario_grupo',
    sa.Column('usuario_id', UNSIGNED_INT, nullable=False),
    sa.Column('grupo_id', UNSIGNED_INT, nullable=False),
    sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuario.id'], name='fk_ug_usuario', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['grupo_id'], ['grupo.id'], name='fk_ug_grupo', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('usuario_id', 'grupo_id'),
    **TABLE_OPTS
    )
    op.create_index('idx_ug_grupo', 'usuario_grupo', ['grupo_id'], unique=False)
    op.create_table('grupo_funcionalidade',
    sa.Column('grupo_id', UNSIGNED_INT, nullable=False),
    sa.Column('funcionalidade_id', UNSIGNED_INT, nullable=False),
    sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['grupo_id'], ['grupo.id'], name='fk_gf_grupo', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['funcionalidade_id'], ['funcionalidade.id'], name='fk_gf_funcionalidade', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('grupo_id', 'funcionalidade_id'),
    **TABLE_OPTS
    )
    op.create_index('idx_gf_funcionalidade', 'grupo_funcionalidade', ['funcionalidade_id'], unique=False)

    # Views não são detectadas pelo autogenerate: mantidas à mão aqui
    op.execute("""
        CREATE OR REPLACE VIEW vw_permissao_usuario AS
        SELECT DISTINCT
            u.id     AS usuario_id,
            u.email,
            f.codigo AS funcionalidade_codigo,
            f.modulo
        FROM usuario u
        JOIN usuario_grupo        ug ON ug.usuario_id = u.id
        JOIN grupo                g  ON g.id = ug.grupo_id AND g.ativo = 1
        JOIN grupo_funcionalidade gf ON gf.grupo_id = g.id
        JOIN funcionalidade       f  ON f.id = gf.funcionalidade_id AND f.ativo = 1
        WHERE u.ativo = 1
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute('DROP VIEW IF EXISTS vw_permissao_usuario')
    op.drop_table('grupo_funcionalidade')
    op.drop_table('usuario_grupo')
    op.drop_table('funcionalidade')
    op.drop_table('grupo')
    op.drop_table('usuario')
