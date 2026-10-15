from fastapi import FastAPI

from app.logger import setup_logging
from app.routers import health, items

# As tabelas são criadas pelas migrations (alembic upgrade head), não aqui.
setup_logging()

app = FastAPI(title="Nutrilite API")

app.include_router(health.router, prefix="/api")
app.include_router(items.router, prefix="/api")
