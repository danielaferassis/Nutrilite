"""adiciona talhao na previsao

Previsões importadas da planilha de programação da fazenda guardam o talhão.
A reimportação sincroniza só as previsões com talhão; as manuais (NULL) não
são tocadas.

Revision ID: b7d2e5a9c814
Revises: a9c4e2f17b30
Create Date: 2026-11-17 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7d2e5a9c814'
down_revision: Union[str, Sequence[str], None] = 'a9c4e2f17b30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'previsao_oferta', sa.Column('talhao', sa.String(length=50), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('previsao_oferta', 'talhao')
