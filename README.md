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
│   │   ├── acesso.py        # sessão de login e checagem de permissões
│   │   ├── security.py      # hash de senha (Argon2id) e de token
│   │   ├── cli.py           # comandos administrativos (criar admin)
│   │   ├── worker.py        # processa a fila de importações (container próprio)
│   │   ├── importacao/      # contrato dos parsers, tipos de arquivo e armazenamento
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
│   │   ├── main.tsx         # ponto de entrada (montagem do React no DOM)
│   │   ├── App.tsx          # componente principal e roteamento básico
│   │   ├── api.ts           # chamadas à API e tipos
│   │   ├── index.css        # folha de estilos global (Tailwind)
│   │   ├── logger.ts        # padrão de logs
│   │   └── components/      
│   │       ├── ui/                   # biblioteca base de componentes estritos e reutilizáveis
│   │       │   ├── Button.tsx        # encapsulamento de botões
│   │       │   ├── Card.tsx          # containers de layout
│   │       │   ├── Input.tsx         # campos de formulário e validação
│   │       │   └── index.ts          # agregador de exportações (Padrão Barrel)
│   │       ├── DashboardPCP.tsx      # Visão centralizada para o perfil PCP/Gestor
│   │       ├── EntradaPrevisoes.tsx  # Tela de Lançamento de Previsões (Entrada do Campo)
│   │       ├── GestaoDemandas.tsx    # Tela de Gestão de Demandas (Cadastro e conversão)
│   │       ├── ItemList.tsx          # Componente auxiliar para listagem de itens
│   │       ├── Login.tsx             # Tela de Autenticação e Controle de Acesso (RBAC)
│   │       └── MatrizCapacidade.tsx  # Tela de Cadastros (Ervas, Secadores e Restrições)
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile           # desenvolvimento (Vite dev server)
│   └── Dockerfile.prod      # produção (build servido pelo Caddy)
├── caddy/Caddyfile          # proxy HTTPS de produção
├── .github/workflows/       # CI e deploy automático
├── docker-compose.yml       # desenvolvimento
└── docker-compose.prod.yml  # produção (VPS)
```

Para adicionar um recurso novo no backend: crie o model em `models.py`, gere a migration (veja [Migrations](#migrations)), crie os schemas em `schemas.py`, um arquivo em `routers/` e registre-o em `main.py`. Os endpoints exigem login; veja [Autenticação e permissões](#autenticação-e-permissões).

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

## Autenticação e permissões

O login é por **sessão no servidor**, guardada num cookie `HttpOnly` (o JavaScript do frontend não tem acesso ao token):

- `POST /api/auth/login` com `{email, senha}` cria a sessão e devolve o cookie `sessao` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api`). No banco fica só o hash SHA-256 do token (tabela `sessao`).
- A sessão expira após **8 h sem uso** ou **7 dias** no máximo (`SESSAO_OCIOSA_MINUTOS`, `SESSAO_MAXIMA_DIAS`).
- Trocar a senha ou desativar o usuário derruba as sessões dele na hora.
- Login tem limite de tentativas: 5 erros por e-mail ou 20 por IP a cada 15 min (contagem em memória, zera ao reiniciar o backend).
- Requisições que alteram dados vindas de outro site são recusadas (`Sec-Fetch-Site`/`Origin`), além do `SameSite=Strict`.
- `COOKIE_SECURE` fica `true` por padrão (cookie só via HTTPS); o `docker-compose.yml` de dev desliga porque o acesso é por `http://`.

**Permissões:** usuário → grupos → funcionalidades. Cada funcionalidade tem um `codigo` (ex.: `usuario.gerenciar`) que o backend checa com a view `vw_permissao_usuario`. Grupos ou funcionalidades inativos não dão permissão.

| Endpoint | Exige |
| --- | --- |
| `/api/health`, `/api/auth/login`, `/api/auth/logout` | nada |
| `/api/auth/me`, `/api/auth/senha`, `/api/items` | estar logado |
| `/api/usuarios` | `usuario.gerenciar` |
| `/api/grupos`, `GET /api/funcionalidades` | `grupo.gerenciar` |

Para proteger um endpoint novo:

```python
from app.acesso import get_usuario_atual, requer_permissao

@router.get("", dependencies=[Depends(requer_permissao("relatorio.ver"))])  # login + permissão
@router.get("/meus", dependencies=[Depends(get_usuario_atual)])            # só login
```

Funcionalidades são cadastradas direto no banco (`INSERT INTO funcionalidade ...`), não pela API.

**Primeiro acesso:** como tudo exige login, crie um administrador pela linha de comando. O comando cria (ou reaproveita) o grupo `Administrador` com **todas** as funcionalidades ativas e coloca o usuário nele (a senha é pedida no terminal):

```bash
docker compose exec backend python -m app.cli criar-admin --email voce@exemplo.com --nome "Seu Nome"
# sem Docker (dentro de backend/): python -m app.cli criar-admin --email ...
```

Rode de novo (com o mesmo e-mail) depois de cadastrar funcionalidades novas, para o grupo recebê-las. Para recuperar o acesso de um admin, use `--redefinir-senha`.

## Importação de arquivos (CSV/Excel)

A tabela `importacao` é uma **fila**. O usuário envia o arquivo, a API guarda e enfileira, e o serviço **worker** (`python -m app.worker`, container próprio) processa um por vez:

```
POST /api/importacoes ──► pendente ──► processando ──► concluido
                              │                    └──► erro ──► (reprocessar) ──► pendente
                              └──► cancelado
```

- O arquivo fica em disco (`UPLOADS_DIR`, volume `uploads` no Docker), não no banco. Aceita `.csv`, `.xlsx` e `.xls` de até `UPLOAD_MAX_MB` (20 MB), conferindo o conteúdo e não só a extensão.
- Enviar de novo um arquivo idêntico (mesmo SHA-256 e tipo) dá `409`, a menos que mande `forcar=true`.
- **Tudo ou nada:** se o parser registrar qualquer erro de linha ou falhar, nada daquele arquivo é gravado. Os erros por linha ficam em `importacao_erro` para o usuário corrigir a planilha.
- Se o worker morrer no meio (deploy, falta de memória), a importação volta para a fila sozinha; depois de 3 interrupções vira `erro`. No deploy o worker espera até 2 min a importação atual terminar.
- Os arquivos são apagados `IMPORTACAO_RETENCAO_DIAS` (30) dias depois que a importação termina; depois disso não dá mais para reprocessar.

| Endpoint (exige `relatorio.importacao`) | |
| --- | --- |
| `GET /api/importacoes/tipos` | tipos disponíveis para o select do upload |
| `POST /api/importacoes` | multipart: `arquivo`, `tipo`, `forcar` (opcional). Responde `202` com a importação |
| `GET /api/importacoes?status=&tipo=&minhas=&limite=&offset=` | lista, mais recentes primeiro |
| `GET /api/importacoes/{id}` | status (o frontend consulta a cada poucos segundos enquanto `pendente`/`processando`) |
| `GET /api/importacoes/{id}/erros` | erros por linha |
| `POST /api/importacoes/{id}/reprocessar` | volta para a fila (só `erro`/`cancelado`) |
| `POST /api/importacoes/{id}/cancelar` | só enquanto `pendente` |

**Escrevendo um parser:** veja o passo a passo em `backend/app/importacao/tipos.py`. Em resumo, uma função que recebe um `ContextoImportacao` (`app/importacao/contexto.py`), lê `ctx.arquivo`, grava com `ctx.db` (incluindo `importacao_id=ctx.importacao_id` nas linhas, para saber a origem e poder desfazer), chama `ctx.erro_linha(...)` para linhas inválidas ou lança `ErroImportacao` se o arquivo todo for inválido, e devolve o total de linhas lidas. Não chame `commit`: quem controla a transação é o worker. Em dev o worker reinicia sozinho quando um `.py` muda; os logs saem em `docker compose logs -f worker`.

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
4. Em outro terminal, crie as tabelas e o primeiro usuário:
   ```bash
   docker compose exec backend alembic upgrade head
   docker compose exec backend python -m app.cli criar-admin --email voce@exemplo.com
   ```

### Windows

1. Instale o [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/) (com o backend WSL 2, que é o padrão).
2. Abra o Docker Desktop e espere ele iniciar.
3. No PowerShell, na raiz do projeto:
   ```powershell
   docker compose up --build
   ```
4. Em outro terminal, crie as tabelas e o primeiro usuário:
   ```powershell
   docker compose exec backend alembic upgrade head
   docker compose exec backend python -m app.cli criar-admin --email voce@exemplo.com
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

Requisitos: **Python 3.12+**, **Node.js 20.19+** (recomendado 22 ou 24) e um **MySQL**. Use dois terminais, um para o backend e outro para o frontend (e um terceiro com `python -m app.worker`, dentro de `backend/` com o venv ativado, se for testar importações).

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
python -m app.cli criar-admin --email voce@exemplo.com   # só na primeira vez
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
python -m app.cli criar-admin --email voce@exemplo.com   # só na primeira vez
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

`docker-compose.prod.yml` sobe quatro serviços:

- **web** — Caddy servindo o build do React e repassando `/api` para o backend. É o **único** serviço exposto, só em HTTPS na porta `8443` (`HTTPS_PORT`), porque 80/443 já são usadas por outro projeto na VPS.
- **backend** — FastAPI sem `--reload`, sem porta publicada.
- **worker** — mesma imagem do backend, processando a fila de importações. Divide com o backend o volume `uploads`.
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
docker compose run --rm backend python -m app.cli criar-admin --email voce@exemplo.com
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
