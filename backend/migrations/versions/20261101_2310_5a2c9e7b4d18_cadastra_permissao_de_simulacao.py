"""cadastra permissao de simulacao

Revision ID: 5a2c9e7b4d18
Revises: 1711dd75ad70
Create Date: 2026-11-01 23:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5a2c9e7b4d18'
down_revision: Union[str, Sequence[str], None] = '1711dd75ad70'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Checada por POST /api/simulacoes (perfil PCP/Gestor)
FUNCIONALIDADES = [
    ('plano.simular', 'Simular plano', 'Rodar o motor de planejamento sobre o cadastro atual'),
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
