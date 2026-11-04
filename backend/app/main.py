from fastapi import Depends, FastAPI

from app.acesso import verificar_origem
from app.erros import registrar_handlers
from app.logger import setup_logging
from app.routers import (
    auth,
    bloqueios,
    cadastros,
    cronograma,
    demandas,
    funcionalidades,
    grupos,
    health,
    importacoes,
    items,
    planos,
    previsoes,
    recebimentos,
    simulacoes,
    usuarios,
)

# As tabelas são criadas pelas migrations (alembic upgrade head), não aqui.
setup_logging()

# verificar_origem roda em toda requisição (proteção contra CSRF)
app = FastAPI(title="Nutrilite API", dependencies=[Depends(verificar_origem)])
# Erros de validação e do framework em português (app/erros.py)
registrar_handlers(app)

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
app.include_router(planos.router, prefix="/api")
app.include_router(bloqueios.router, prefix="/api")
app.include_router(cadastros.router, prefix="/api")
app.include_router(recebimentos.router, prefix="/api")
app.include_router(cronograma.router, prefix="/api")
