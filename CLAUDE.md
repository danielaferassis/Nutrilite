# CLAUDE.md — Nutrilite

Contexto para o Claude Code neste repositório. Projeto de TCC (Sistemas de Informação, PUC Minas): sistema web de **planejamento da secagem de ervas** para a fazenda Nutrilite (Ubajara-CE). Hoje o planejamento é feito em planilhas Excel; o sistema cruza demanda, oferta prevista e capacidade dos secadores e aponta conflitos antes de a erva fresca chegar.

## Stack e comandos

- Backend: FastAPI + SQLAlchemy 2 + Alembic, Python 3.12+ (CI usa 3.13). MySQL 8.4.
- Frontend: React + TypeScript (Vite). Chama a API sempre por `/api/...`.
- Tudo roda com Docker Compose (o desenvolvedor usa WSL2 + Docker Desktop).

```bash
docker compose up -d                                   # sobe db, backend e frontend
docker compose exec backend pytest                     # testes do backend
docker compose exec backend pytest tests/planner -v    # só o motor
docker compose exec backend alembic upgrade head       # aplica migrations
docker compose exec -u $(id -u):$(id -g) backend alembic revision --autogenerate -m "descricao"
cd frontend && npm run typecheck                       # checagem de tipos do front
```

## Convenções

- Código, nomes e mensagens em **português**.
- Novo recurso no backend: model em `models.py` → migration (revisar o arquivo gerado) → schemas em `schemas.py` → `routers/<recurso>.py` → registrar em `main.py`.
- Tabelas só mudam por migration; nunca `create_all`.
- Logs: `log = logging.getLogger(__name__)` no backend, `logger` de `src/logger.ts` no front. Nada de `print`/`console.log`.
- Git: uma branch por tarefa (`feature/...`), PR para a `main`. **Nunca fazer push direto na `main`**: todo push nela faz deploy na VPS.
- Mensagens de commit no padrão `tipo(escopo): descrição` (ex.: `feat(planner): ...`).

## Domínio

- **Secadores**: SCB01 (elétrico), SCB02 (vapor), SCB03 (GLP). Cada um processa **uma erva por vez**; a capacidade depende da combinação erva × secador.
- **Ervas**: agrião, camomila, picão-preto, salsa (e fibra de acerola).
- **Regime**: 24 h/dia para a maioria; camomila 12 h/dia (sem secagem noturna).
- **Setups**: inicial (início da campanha da erva), final (limpeza ao encerrar) e diário. Trocar de erva no secador custa setup final + inicial.
- **Estágios**: fresco → desidratado (secador) → moído (produto acabado). A demanda costuma vir em produto acabado e é convertida para kg de fresco pelos rendimentos (cálculo reverso).
- **Origens da oferta**: Fazenda Própria, Procompete (produtores parceiros) e P&D.
- **Oferta não é reagendável**: a erva chega quando é colhida e é perecível. O que não encontra secador dentro do tempo máximo de espera é perda.
- **Prioridade entre secadores** (regra atual): SCB03 para maiores volumes, SCB01 para picão, SCB02 para menores volumes.

### Regras que não podem ser quebradas

- **Parâmetro ausente nunca é preenchido com valor padrão.** Vira pendência `PARAM_AUSENTE` visível ao usuário.
- KPI com denominador zero vale `None` ("não aplicável"), nunca `0`.
- Não somar kg de ervas diferentes como se fossem equivalentes; ocupação é medida em **horas**.
- Cada plano salvo guarda versão, parâmetros usados e quem aprovou (rastreabilidade).
- Autorização sempre verificada no backend. Perfis: Administrador técnico, PCP/Gestor (simula e aprova), Fonte fornecedora (só as próprias previsões), Produção/consulta.

### Ainda pendente de validação com a empresa

Tempo máximo de espera da erva fresca ("regra dos 15 dias"), tabela oficial de capacidade erva × secador, matriz de trocas e compatibilidades, calendário/bloqueios, formato do CSV do Infinity e fórmula local de OEE. Enquanto não houver valor validado, o código deve sinalizar a ausência, não inventar.

## Motor de planejamento (`backend/app/planner/`)

Lógica pura em Python, **sem importar SQLAlchemy nem FastAPI**. A API converte models nos dataclasses de `types.py`, chama `simular()` e persiste o resultado. Detalhes e status em `backend/app/planner/README.md`.

- `types.py` é o contrato entre as partes: alterar só em conjunto com a dupla do motor.
- Algoritmo do MVP: guloso, dia a dia, explicável. Otimização sofisticada fica fora do MVP.
- Saída: necessidades de fresco, alocações (secador × erva × dia), pendências (`PARAM_AUSENTE`, `CAPACIDADE_EXCEDIDA`, `ATRASO`, `SALDO_NAO_ALOCADO`) e KPIs.

## Escopo do MVP

Dentro: demandas e previsões, capacidade, simulação e aprovação de plano, cronograma e recebimentos, login com perfis. Complementar: importação do Infinity (CSV) e painel de OEE. Fora: planejamento de plantio, integrações automáticas, escrita no ERP.

## Dados

- Usar apenas **dados fictícios** em testes, seeds e exemplos. Não versionar planilhas, exportações ou números reais cedidos pela empresa.
- Credenciais só em `.env` (ignorado pelo git).
