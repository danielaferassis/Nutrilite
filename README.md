# Nutrilite

Aplicação web com **React + TypeScript** (Vite) no frontend e **FastAPI** no backend, com **MySQL** via SQLAlchemy e migrations com Alembic.

## Estrutura

```
.
├── backend/                 # API FastAPI
│   ├── app/
│   │   ├── main.py          # cria o app e registra as rotas
│   │   ├── config.py        # configurações (lidas do .env)
│   │   ├── logger.py        # padrão de logs
│   │   ├── database.py      # conexão com o banco (SQLAlchemy)
│   │   ├── models.py        # tabelas do banco
│   │   ├── schemas.py       # formatos de entrada/saída da API (Pydantic)
│   │   └── routers/         # rotas, um arquivo por recurso
│   ├── migrations/
│   │   ├── env.py           # configuração do Alembic
│   │   └── versions/        # uma migration por arquivo
│   ├── tests/
│   ├── alembic.ini
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                # app React
│   ├── src/
│   │   ├── main.tsx         # ponto de entrada
│   │   ├── App.tsx          # componente principal
│   │   ├── api.ts           # chamadas à API e tipos
│   │   ├── logger.ts        # padrão de logs
│   │   └── components/      # componentes reutilizáveis
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile           # desenvolvimento (Vite dev server)
│   └── Dockerfile.prod      # produção (build servido pelo Caddy)
├── caddy/Caddyfile          # proxy HTTPS de produção
├── .github/workflows/       # CI e deploy automático
├── docker-compose.yml       # desenvolvimento
└── docker-compose.prod.yml  # produção (VPS)
```

Para adicionar um recurso novo no backend: crie o model em `models.py`, gere a migration (veja [Migrations](#migrations)), crie os schemas em `schemas.py`, um arquivo em `routers/` e registre-o em `main.py`.

## Endereços

| Serviço              | URL                          |
| -------------------- | ---------------------------- |
| Frontend             | http://localhost:5173        |
| API                  | http://localhost:8000/api    |
| Documentação da API  | http://localhost:8000/docs   |

O frontend chama a API sempre por `/api/...`; o Vite redireciona essas requisições para o backend.

## Banco de dados

O banco é **MySQL 8.4**, que sobe junto no `docker-compose.yml` (serviço `db`, porta `3306`, usuário/senha/banco `app`). Os dados ficam no volume `db_data` e não se perdem ao reiniciar os containers.

A conexão vem da variável `DATABASE_URL` (veja `backend/.env.example`). Para trocar de banco no futuro, basta mudar essa URL e o driver em `requirements.txt`.

## Migrations

As tabelas **não** são criadas automaticamente: elas são criadas e alteradas por migrations do [Alembic](https://alembic.sqlalchemy.org/), executadas manualmente. Na primeira vez que subir o projeto (e sempre que alguém adicionar uma migration nova), aplique as pendentes:

```bash
# com Docker
docker compose exec backend alembic upgrade head

# sem Docker (dentro de backend/, com o venv ativado)
alembic upgrade head
```

Para criar uma migration depois de alterar `models.py`:

```bash
# com Docker (Linux: o -u evita que o arquivo gerado fique com dono root)
docker compose exec -u $(id -u):$(id -g) backend alembic revision --autogenerate -m "descricao da mudanca"

# com Docker (Windows)
docker compose exec backend alembic revision --autogenerate -m "descricao da mudanca"

# sem Docker
alembic revision --autogenerate -m "descricao da mudanca"
```

O arquivo é criado em `backend/migrations/versions/`. **Revise sempre o que foi gerado** antes de aplicar e versione-o no git junto com a mudança do model.

Outros comandos úteis:

```bash
alembic current          # migration aplicada no banco
alembic history          # lista de migrations
alembic downgrade -1     # desfaz a última migration
```

## Logs

Backend e frontend usam o mesmo formato:

```
2026-10-15 12:29:11 - nutrilite-backend : [INFO ] Item 1 criado
```

Níveis: `DEBUG`, `INFO`, `WARN` e `ERROR`.

**Backend** (logging padrão do Python):

```python
import logging

log = logging.getLogger(__name__)

log.debug("detalhe")
log.info("Item %s criado", item.id)
log.warning("algo estranho")   # sai como WARN
log.error("falhou")
log.log(logging.INFO, "nível escolhido na chamada")
```

**Frontend** (`src/logger.ts`, escreve no console do navegador):

```ts
import { logger } from './logger'

logger.debug('detalhe')
logger.info(`Item ${item.id} criado`)
logger.warn('algo estranho')
logger.error('falhou', error)
logger.log('INFO', 'nível escolhido na chamada')
```

O nível mínimo é configurável: `LOG_LEVEL` em `backend/.env` (padrão `INFO`) e `VITE_LOG_LEVEL` em `frontend/.env` (padrão `DEBUG` em desenvolvimento e `INFO` no build). O nome exibido vem de `APP_NAME` / `VITE_APP_NAME`.

> No Chrome, mensagens `DEBUG` só aparecem com o nível "Verbose" ativado no console.

---

## Rodando com Docker (recomendado)

Só é preciso ter o Docker instalado. Frontend e backend recarregam sozinhos ao salvar arquivos.

### Debian / Ubuntu

1. Instale o Docker Engine com o plugin Compose seguindo o guia oficial:
   [Debian](https://docs.docker.com/engine/install/debian/) ·
   [Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
2. (Opcional) Para usar o Docker sem `sudo`:
   ```bash
   sudo usermod -aG docker $USER   # depois faça logout e login
   ```
3. Na raiz do projeto:
   ```bash
   docker compose up --build
   ```
4. Em outro terminal, crie as tabelas:
   ```bash
   docker compose exec backend alembic upgrade head
   ```

### Windows

1. Instale o [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/) (com o backend WSL 2, que é o padrão).
2. Abra o Docker Desktop e espere ele iniciar.
3. No PowerShell, na raiz do projeto:
   ```powershell
   docker compose up --build
   ```
4. Em outro terminal, crie as tabelas:
   ```powershell
   docker compose exec backend alembic upgrade head
   ```

### Comandos úteis

```bash
docker compose up -d          # sobe em segundo plano
docker compose logs -f        # acompanha os logs
docker compose down           # para tudo
docker compose down -v        # para tudo e APAGA os dados do banco
docker compose up --build -V  # rebuild (após mudar requirements.txt ou package.json)
docker compose exec db mysql -uapp -papp app                                        # console do MySQL
docker compose exec backend sh -c "pip install -r requirements-dev.txt && pytest"   # testes
```

---

## Rodando sem Docker

Requisitos: **Python 3.12+**, **Node.js 20.19+** (recomendado 22 ou 24) e um **MySQL**. Use dois terminais, um para o backend e outro para o frontend.

### MySQL

O jeito mais simples é usar só o banco do Docker, rodando o resto direto na máquina:

```bash
docker compose up -d db
```

Se preferir instalar o banco na máquina (Debian: `sudo apt install mariadb-server`, Ubuntu: `sudo apt install mysql-server`, Windows: [MySQL Installer](https://dev.mysql.com/downloads/installer/)), crie o banco e o usuário usados pelo projeto:

```sql
CREATE DATABASE app;
CREATE USER 'app'@'localhost' IDENTIFIED BY 'app';
GRANT ALL PRIVILEGES ON app.* TO 'app'@'localhost';
```

### Debian / Ubuntu

Instalar dependências do sistema:

```bash
sudo apt update
sudo apt install python3 python3-venv python3-pip
```

Para o Node, use o [nvm](https://github.com/nvm-sh/nvm) (a versão do `apt` costuma ser antiga):

```bash
nvm install --lts
```

**Terminal 1 — backend:**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

**Terminal 2 — frontend:**

```bash
cd frontend
npm install
npm run dev
```

### Windows

Instale o [Python](https://www.python.org/downloads/) (marque *"Add python.exe to PATH"*) e o [Node.js LTS](https://nodejs.org/).

**Terminal 1 — backend (PowerShell):**

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
copy .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

> Se o PowerShell bloquear o `Activate.ps1`, rode uma vez:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

**Terminal 2 — frontend (PowerShell):**

```powershell
cd frontend
npm install
npm run dev
```

### Testes e verificação

Backend — com o ambiente virtual ativado, dentro de `backend/`:

```bash
pytest
```

Frontend — checagem de tipos do TypeScript, dentro de `frontend/`:

```bash
npm run typecheck
```

---

## Deploy na VPS

Todo push na `main` dispara o workflow `.github/workflows/deploy.yml`:

1. Roda os testes do backend e o typecheck/build do frontend (também em todo PR).
2. Se passar, entra na VPS por SSH e executa:
   ```bash
   git reset --hard origin/main
   docker compose -f docker-compose.prod.yml build
   docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade head
   docker compose -f docker-compose.prod.yml up -d
   ```
   As migrations rodam **antes** de trocar os containers: se falharem, o deploy para e a versão anterior continua no ar.

O `reset --hard` não mexe em arquivos ignorados pelo git, então o `.env` da VPS fica intacto. Os dados do MySQL ficam no volume `db_data`.

### Stack de produção

`docker-compose.prod.yml` sobe três serviços:

- **web** — Caddy servindo o build do React e repassando `/api` para o backend. É o **único** serviço exposto, só em HTTPS na porta `8443` (`HTTPS_PORT`), porque 80/443 já são usadas por outro projeto na VPS.
- **backend** — FastAPI sem `--reload`, sem porta publicada.
- **db** — MySQL, sem porta publicada.

Acesso: `https://SEU_IP:8443`. Sem domínio o certificado é self-signed (`tls internal`): o navegador avisa na primeira vez, basta aceitar.

### Configuração inicial na VPS (uma vez)

Pressupõe a VPS já com Docker e o usuário de deploy no grupo `docker` (como no projeto secretario_financeiro).

**1. Deploy key para a VPS puxar o repositório.** Cada deploy key do GitHub vale para um único repositório, então este projeto precisa de uma chave própria e de um apelido de host no SSH. Como o usuário de deploy:

```bash
ssh-keygen -t ed25519 -C "vps-nutrilite-deploy" -f ~/.ssh/nutrilite_deploy -N ""
cat ~/.ssh/nutrilite_deploy.pub   # copie a saída

cat >> ~/.ssh/config <<'EOF'
Host github-nutrilite
  HostName github.com
  IdentityFile ~/.ssh/nutrilite_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
```

No GitHub: repositório → **Settings → Deploy keys → Add deploy key**, cole a chave pública **sem** "Allow write access" (precisa ser admin do repositório).

**2. Clonar e configurar:**

```bash
sudo mkdir -p /opt/nutrilite && sudo chown "$USER:$USER" /opt/nutrilite
git clone git@github-nutrilite:danielaferassis/Nutrilite.git /opt/nutrilite
cd /opt/nutrilite
cp .env.prod.example .env
```

Edite o `.env`: `SITE_ADDRESS` (IP ou domínio, sem `https://`) e as senhas do MySQL (só letras e números).

**3. Liberar a porta** `8443/tcp` no firewall do provedor (ou `sudo firewall-cmd --permanent --add-port=8443/tcp && sudo firewall-cmd --reload`).

**4. Primeiro deploy na mão**, para validar antes de ligar o automático:

```bash
export COMPOSE_FILE=docker-compose.prod.yml
docker compose build
docker compose run --rm backend alembic upgrade head
docker compose up -d
docker compose logs -f
```

### Secrets do repositório (Settings → Secrets and variables → Actions)

| Secret        | O que é                                                   |
| ------------- | --------------------------------------------------------- |
| `SSH_HOST`    | IP ou domínio da VPS                                      |
| `SSH_USER`    | usuário de deploy na VPS                                  |
| `SSH_KEY`     | chave **privada** que o CI usa para entrar na VPS         |
| `SSH_PORT`    | porta SSH (opcional; padrão `22`)                         |
| `DEPLOY_PATH` | caminho do repositório na VPS (ex.: `/opt/nutrilite`)     |