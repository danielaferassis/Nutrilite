"""cadastra permissao de cadastro da secagem

Revision ID: e7a4c2d9b315
Revises: d5f3a17da9b7
Create Date: 2026-11-11 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7a4c2d9b315'
down_revision: Union[str, Sequence[str], None] = 'd5f3a17da9b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Checada pelas rotas de escrita de /api/ervas, /secadores, /capacidades e /rendimentos.
# A leitura continua aberta a quem está logado (os selects das telas usam).
FUNCIONALIDADES = [
    (
        'cadastro.gerenciar',
        'Gerenciar cadastro da secagem',
        'Cadastrar e alterar ervas, secadores, capacidades e rendimentos',
    ),
]


def upgrade() -> None:
    """Upgrade schema."""
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
