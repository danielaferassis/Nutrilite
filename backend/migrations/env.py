import logging

from alembic import context

import app.models  # noqa: F401  (registra os models no Base.metadata)
from app.database import Base, engine
from app.logger import setup_logging

setup_logging()
logging.getLogger("alembic.runtime.plugins").setLevel(logging.WARNING)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Gera o SQL sem conectar no banco (alembic upgrade head --sql)."""
    context.configure(
        url=engine.url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
