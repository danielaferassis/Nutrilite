from fastapi import FastAPI

from app.logger import setup_logging
from app.routers import funcionalidades, grupos, health, items, usuarios

# As tabelas são criadas pelas migrations (alembic upgrade head), não aqui.
setup_logging()

app = FastAPI(title="Nutrilite API")

app.include_router(health.router, prefix="/api")
app.include_router(items.router, prefix="/api")
app.include_router(usuarios.router, prefix="/api")
app.include_router(grupos.router, prefix="/api")
app.include_router(funcionalidades.router, prefix="/api")
