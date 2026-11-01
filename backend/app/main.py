from fastapi import Depends, FastAPI

from app.acesso import verificar_origem
from app.logger import setup_logging
from app.routers import (
    auth,
    demandas,
    funcionalidades,
    grupos,
    health,
    importacoes,
    items,
    previsoes,
    simulacoes,
    usuarios,
)

# As tabelas são criadas pelas migrations (alembic upgrade head), não aqui.
setup_logging()

# verificar_origem roda em toda requisição (proteção contra CSRF)
app = FastAPI(title="Nutrilite API", dependencies=[Depends(verificar_origem)])

app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(items.router, prefix="/api")
app.include_router(usuarios.router, prefix="/api")
app.include_router(grupos.router, prefix="/api")
app.include_router(funcionalidades.router, prefix="/api")
app.include_router(importacoes.router, prefix="/api")
app.include_router(demandas.router, prefix="/api")
app.include_router(previsoes.router, prefix="/api")
app.include_router(simulacoes.router, prefix="/api")
