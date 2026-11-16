"""cadastra permissoes de acesso e importacao

As rotas de usuários, grupos e importações já checavam estas permissões, mas
nenhuma migration as inseria: num banco novo, o `criar-admin` não as dava ao
grupo Administrador.

Bancos que já as têm (cadastradas à mão) não são alterados: só entram as que
faltam.

Revision ID: a9c4e2f17b30
Revises: e7a4c2d9b315
Create Date: 2026-11-16 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a9c4e2f17b30'
down_revision: Union[str, Sequence[str], None] = 'e7a4c2d9b315'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (codigo, nome, descricao, modulo)
FUNCIONALIDADES = [
    (
        'usuario.gerenciar',
        'Gerenciar usuários',
        'Cadastrar, alterar, desativar e remover usuários e seus grupos',
        'administracao',
    ),
    (
        'grupo.gerenciar',
        'Gerenciar grupos e permissões',
        'Cadastrar grupos e definir as funcionalidades de cada um',
        'administracao',
    ),
    (
        'relatorio.importacao',
        'Importar arquivos',
        'Enviar arquivos para importação (Infinity) e acompanhar o processamento',
        'importacao',
    ),
]


def upgrade() -> None:
    """Upgrade schema."""
    conexao = op.get_bind()
    existentes = set(conexao.execute(sa.text('SELECT codigo FROM funcionalidade')).scalars())

    funcionalidade = sa.table(
        'funcionalidade',
        sa.column('codigo', sa.String),
        sa.column('nome', sa.String),
        sa.column('descricao', sa.String),
        sa.column('modulo', sa.String),
    )
    novas = [
        {'codigo': codigo, 'nome': nome, 'descricao': descricao, 'modulo': modulo}
        for codigo, nome, descricao, modulo in FUNCIONALIDADES
        if codigo not in existentes
    ]
    if novas:
        op.bulk_insert(funcionalidade, novas)


def downgrade() -> None:
    """Downgrade schema.

    Não remove nada: em bancos onde estas permissões já existiam antes desta
    migration, apagá-las tiraria o acesso de administração dos grupos.
    """
