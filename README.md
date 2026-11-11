# Fullstack ToDo App

A task management application with a React interface and a FastAPI REST API. PostgreSQL stores tasks and categories, and Redis caches list responses. The backend separates HTTP handling, business logic, and database access through routers, services, and repositories.

## Features

- Create, edit, delete, and toggle completion for tasks and categories.
- Filter tasks by All, Active, or Completed in the browser, with collection counts.
- Keep unsaved form drafts, retry failed requests, and display loading, empty, and error states.
- Use keyboard editing controls and a responsive interface.
- Persist records in PostgreSQL and invalidate cached lists after successful writes.
- Explore the API through Swagger UI and OpenAPI.
- Run the full stack with Docker Compose and test against isolated PostgreSQL and Redis instances.

Categories are independent records; they cannot be assigned to tasks. There are no user accounts or authentication.

## Tech Stack

**Backend**

![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)

**Database & cache**

![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-D71F00?style=flat-square&logo=sqlalchemy&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white)

**Frontend**

![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Axios](https://img.shields.io/badge/Axios-5A29E4?style=flat-square&logo=axios&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-663399?style=flat-square&logo=css&logoColor=white)

**Containers**

![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)

| Area | Technologies |
| --- | --- |
| Backend | Python 3.12, FastAPI, Uvicorn, Pydantic, pydantic-settings |
| Data access | SQLAlchemy, psycopg 3 |
| Database | PostgreSQL 16 in Compose |
| Cache | Redis 7 in Compose, redis-py client |
| Frontend | React 19, JavaScript, Axios, CSS, Create React App (`react-scripts`) |
| Containers | Docker, Docker Compose; digest-pinned Python, PostgreSQL, and Redis images |
| Backend tests | pytest, SQLite, mocks, and real PostgreSQL/Redis integration tests |
| Frontend tests | Jest, React Testing Library, jest-dom, user-event |

## Architecture

```mermaid
flowchart LR
    UI[React / Axios] --> Router[FastAPI routers]
    Router --> Service[Services]
    Service --> Repository[Repositories]
    Repository --> DB[(PostgreSQL / SQLAlchemy)]
    Service --> Cache[(Redis list cache)]
```

| Layer | Responsibility |
| --- | --- |
| Routers | Define endpoints, validate request/response schemas, and map missing records to HTTP 404. |
| Services | Apply updates, commit or roll back transactions, and read/invalidate cached lists. |
| Repositories | Query, add, and delete ORM objects without committing transactions. |
| Models and schemas | Define database tables and Pydantic request/response structures. |
| Database dependencies | Provide a session for each request and close it afterward. |

PostgreSQL is the source of truth. Redis holds JSON representations of task and category lists. Normal application startup does not create tables; Compose runs a separate initialization service.

The React UI lives in `src/App.js`, shared controls in `src/components/`, and collection state in `src/hooks/useCollection.js`. Successful mutations trigger a list refresh. Filtering and ordering are managed in browser memory; the API does not promise a sorted order, and a page reload can change the displayed order.

```text
todo-app/
├── compose.yaml             # Root entry point; includes the existing stack
├── .env.example             # Root Compose configuration template
├── todo-app-backend/
│   ├── app/
│   │   ├── api/routers/       # Task and category endpoints
│   │   ├── api/dependencies.py
│   │   ├── cache/redis.py     # JSON cache adapter
│   │   ├── core/config.py    # Settings
│   │   ├── db/session.py     # Engine and session lifecycle
│   │   ├── models/           # SQLAlchemy tables
│   │   ├── repositories/     # Database access
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── services/         # Transactions and caching
│   │   └── main.py
│   ├── docker/
│   │   ├── Dockerfile
│   │   ├── Dockerfile.dockerignore
│   │   ├── docker-compose.yml
│   │   ├── entrypoint.py
│   │   ├── init_db.py
│   │   ├── healthcheck.py
│   │   └── verification/    # Optional Compose persistence and Nginx browser checks
│   ├── tests/                # API, service, cache, session, and startup tests
│   │   └── integration/      # PostgreSQL/Redis tests and optional browser regression
│   ├── pytest.ini
│   ├── requirements.txt     # Production dependencies
│   └── requirements-dev.txt # Production + development/test dependencies
├── todo-app-frontend/
│   ├── docker/              # Node build, Nginx static server and /api proxy
│   ├── .env.example         # Host-based frontend development configuration
│   ├── public/              # HTML entry point and robots.txt
│   ├── src/
│   │   ├── App.js
│   │   ├── App.css
│   │   ├── App.test.js
│   │   ├── App.config.test.js
│   │   ├── api.js
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── index.js
│   │   ├── index.css
│   │   └── setupTests.js
│   ├── package.json
│   └── package-lock.json
└── README.md
```

## Quick Start — Docker Compose

Prerequisites: Docker Engine or Docker Desktop, Docker Compose **2.20.0 or later** (for [Compose include](https://docs.docker.com/reference/compose-file/include/)), and permission to use the Docker daemon. Commands below use Bash on Linux or WSL 2.

### 1. Configure the stack

From the repository root, create a separate Compose configuration only if it does not exist:

```bash
test -e .env || cp .env.example .env
chmod 600 .env
```

Edit the root `.env`. Set a unique generated password; **replace the placeholder below before starting**. The example leaves the password empty so an unconfigured launch fails.

```dotenv
POSTGRES_PASSWORD='replace-with-a-generated-password'
POSTGRES_USER=todo
POSTGRES_DB=todo
BACKEND_PORT=18080
FRONTEND_PORT=18000
COMPOSE_PROJECT_NAME=todo-app
CORS_ALLOWED_ORIGINS='["http://localhost:3000","http://127.0.0.1:3000"]'
```

Only `POSTGRES_PASSWORD` is mandatory; the other values shown are defaults. If Python 3 is available, `python3 -c 'import secrets; print(secrets.token_hex(32))'` generates a suitable password. Choose unused `FRONTEND_PORT` and `BACKEND_PORT` values if the defaults are occupied.

The root `.env` is gitignored and separate from the local backend's `todo-app-backend/.env`. Do not commit credentials. Compose supplies `REDIS_URL=redis://redis:6379/0`; the container entrypoint constructs `DATABASE_URL` from the PostgreSQL variables and escapes the password. Neither connection URL needs to be added to the Compose env file.

The root `compose.yaml` includes `todo-app-backend/docker/docker-compose.yml`; both declare the permanent project name `todo-app`. It uses `.env.example` for include defaults and the root environment for overrides, without loading the backend development configuration. Keep `COMPOSE_PROJECT_NAME=todo-app` and PostgreSQL credentials stable. Do not override the project name with `-p` or an old shell/environment value, which would select a different stack.

### 2. Build and start the entire app

From the repository root, this single command builds and starts the frontend, backend, PostgreSQL, Redis, and one-time database initialization. Node.js and npm are not required on the host:

```bash
docker compose up -d --build
```

Startup continues in the background. Check readiness with `docker compose ps -a`; frontend, backend, PostgreSQL, and Redis should become healthy, and `db-init` should exit with code 0. For a command that also waits for health checks:

```bash
docker compose up -d --build --wait --wait-timeout 120
```

For later starts without source changes, reuse the existing local images:

```bash
docker compose up -d --no-build --pull never
```

Use the root `.env` for all commands. If using the included Compose file directly, pass the same root configuration: `docker compose --env-file .env -f todo-app-backend/docker/docker-compose.yml up -d --build` from the repository root. Any older separate Compose env file must use `COMPOSE_PROJECT_NAME=todo-app` and the same credentials and ports.

| Service | Purpose | Host access |
| --- | --- | --- |
| `frontend` | Production React assets served by non-root Nginx; `/api` proxies to FastAPI | `http://127.0.0.1:18000` |
| `backend` | FastAPI on container port 8080, running as a non-root user | `http://127.0.0.1:18080` |
| `postgres` | Persistent PostgreSQL database | No published port |
| `redis` | Disposable list cache | No published port |
| `db-init` | Create missing tables, then exit | None; exit code 0 is expected |

The backend waits for PostgreSQL and Redis health checks and successful schema initialization. Its own health check verifies HTTP, database tables, and Redis connectivity. The frontend waits for a healthy backend; its health check requests the static app and `/api/openapi.json` through Nginx.

- **ToDo App:** http://127.0.0.1:18000
- **Same-origin task API:** http://127.0.0.1:18000/api/tasks
- **Swagger UI (direct backend):** http://127.0.0.1:18080/docs
- **OpenAPI:** http://127.0.0.1:18080/openapi.json
- **Task list:** http://127.0.0.1:18080/tasks

The project creates `todo-app_default` and `todo-app_postgres_data`. Containers are `todo-app-frontend-1`, `todo-app-backend-1`, `todo-app-postgres-1`, `todo-app-redis-1`, and `todo-app-db-init-1`; local application images are `todo-app-frontend:local` and `todo-app-backend:local`. It does not reuse `pg-container`, `todo-redis`, or their development volumes. Port `18080` avoids the local API's `8080`; the database and cache do not occupy host ports.

The frontend image uses a digest-pinned Node.js 24 build stage (`npm ci` and the CRA production build), followed by a digest-pinned Nginx runtime image containing only the static assets and server configuration. Nginx runs as the unprivileged `nginx` user on container port 8080.

The Docker build sets `REACT_APP_API_BASE_URL=/api`. Browser requests stay on the frontend origin; Nginx strips `/api/` and forwards to `backend:8080` over the Compose network. No browser-facing backend URL or additional CORS origin is needed. Local frontend env files are excluded from the build. Nginx refreshes the backend address through Docker DNS and supports page refreshes with an SPA fallback; API errors remain API responses.

`FRONTEND_PORT` defaults to `18000`, avoiding the React development port `3000` and backend ports `8080`/`18080`. Change it in your Compose configuration if occupied; changing the frontend or direct backend host port does not require changing the browser API URL. The existing `BACKEND_PORT` remains available for Swagger and host-based development. Repeated startup commands reuse the `todo-app` project and its PostgreSQL volume.

For host-based React development instead, use the [Run React](#4-run-react) instructions and point `REACT_APP_API_BASE_URL` at the directly published backend.

### 3. Inspect logs and stop

From the repository root, using the root `.env`:

```bash
docker compose logs --tail=100 frontend backend db-init
docker compose down
```

`down` removes this project's containers and network but retains PostgreSQL data. Never use `docker compose down -v` for this stack. Redis persistence is disabled; its cache is rebuilt on demand. Changing `POSTGRES_*` values does not update credentials in an existing database volume.

The former `todo-fullstack-xkjpg3t9` database was migrated by logical backup/restore into `todo-app_postgres_data`. The old `todo-fullstack-xkjpg3t9_postgres_data` volume and local backups under `.docker-backups/` are retained for recovery; do not delete either without separate approval. A fresh clone creates its own empty database volume; local backups and credentials are gitignored.

## Local Development

Run Python and React on the host. Use Python 3.12, Node.js with npm, and reachable PostgreSQL and Redis services. The Docker frontend pins Node.js 24 by image digest; use Node.js 24 for the matching local toolchain. The examples and socket-based backend tests target Linux/WSL 2.

### 1. Provide PostgreSQL and Redis

Use your existing development services, or create dedicated containers with the following example. These names, ports, and volume are separate from both the Compose stack and `pg-container`/`todo-redis`. Replace the password placeholder first:

```bash
docker run -d --name todo-local-postgres \
  -e POSTGRES_USER=todo \
  -e POSTGRES_PASSWORD='replace-with-a-generated-local-password' \
  -e POSTGRES_DB=todo \
  -p 127.0.0.1:25432:5432 \
  -v todo-local-postgres-data:/var/lib/postgresql/data \
  postgres:16-alpine

docker run -d --name todo-local-redis \
  -p 127.0.0.1:16379:6379 --tmpfs /data \
  redis:7-alpine redis-server --save '' --appendonly no
```

Wait for PostgreSQL to report that it accepts connections and Redis to return `PONG`:

```bash
docker exec todo-local-postgres pg_isready -U todo -d todo
docker exec todo-local-redis redis-cli ping
```

Run these creation commands only once. For later sessions, use `docker start todo-local-postgres todo-local-redis`; stop them with `docker stop todo-local-postgres todo-local-redis`. If using existing services instead, adapt the URLs below to their actual ports, database, and credentials. Compose's database and Redis ports are not accessible from the host by default.

### 2. Configure the backend

From the repository root:

```bash
cd todo-app-backend
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
```

`requirements-dev.txt` includes the pinned production requirements plus pytest and its dependencies. For a production-only installation, use `python -m pip install -r requirements.txt`; Docker uses this file too. Browser testing remains optional in `tests/integration/requirements-browser.txt`.

Create or edit `todo-app-backend/.env` for your chosen development services. Do not overwrite an existing configuration without checking it. For the optional containers above:

```dotenv
DATABASE_URL=postgresql+psycopg://todo:replace-with-a-generated-local-password@127.0.0.1:25432/todo
REDIS_URL=redis://127.0.0.1:16379/0
CORS_ALLOWED_ORIGINS='["http://localhost:3000","http://127.0.0.1:3000"]'
```

Use the same PostgreSQL password as the container and percent-encode URL-reserved characters when inserting it into `DATABASE_URL`.

| Application variable | Requirement |
| --- | --- |
| `DATABASE_URL` | Required SQLAlchemy URL; PostgreSQL uses `postgresql+psycopg://`. |
| `REDIS_URL` | Required Redis connection URL. |
| `CORS_ALLOWED_ORIGINS` | Optional JSON array; defaults to `http://localhost:3000` and `http://127.0.0.1:3000`. |

Settings load from `todo-app-backend/.env`; process environment variables take precedence. Settings are cached, so restart the backend after changing them. Cache keys and TTL are supplied directly by `get_settings()`, not configured through these environment variables.

### 3. Initialize tables and run FastAPI

For a new development database, run this once from `todo-app-backend` with the virtual environment active:

```bash
python - <<'PY'
from app.db.session import engine
from app.models.base import Base
from app.models.task import TaskORM
from app.models.category import CategoryORM

Base.metadata.create_all(bind=engine)
engine.dispose()
PY

python -m uvicorn app.main:app --reload --port 8080
```

`create_all` creates missing tables; it does not migrate existing schemas. Normal FastAPI startup performs no schema creation or migration.

The local API is at **http://127.0.0.1:8080**, with Swagger at **http://127.0.0.1:8080/docs**. PostgreSQL and Redis must both be available for normal CRUD operations.

### 4. Run React

In another terminal, from the repository root:

```bash
cd todo-app-frontend
npm ci
npm run dev
```

Open **http://localhost:3000**. Keep port 3000 to match the default CORS origins. Without configuration, the frontend calls **http://127.0.0.1:8080**.

To choose another backend, copy the [frontend environment example](todo-app-frontend/.env.example) once, from `todo-app-frontend`:

```bash
test -e .env.local || cp .env.example .env.local
```

Edit `.env.local` to use the Compose backend:

```dotenv
REACT_APP_API_BASE_URL=http://127.0.0.1:18080
```

To switch back to the local FastAPI backend, set `REACT_APP_API_BASE_URL=http://127.0.0.1:8080` in `.env.local`, or override it for one run with `REACT_APP_API_BASE_URL=http://127.0.0.1:8080 npm run dev`. Shell environment values take precedence over env files.

`REACT_APP_API_BASE_URL` applies to all task and category requests. Unset, empty, or whitespace-only values fall back to `http://127.0.0.1:8080`; trailing slashes are removed. Use a URL reachable by the browser, not a Compose service hostname.

Create React App reads `REACT_APP_*` variables from the environment and frontend env files. Restart `npm run dev` after changing them. These values are embedded in the JavaScript bundle, so they are public and must not contain credentials or tokens. `.env.local` is gitignored and is separate from backend configuration.

To generate static frontend assets:

```bash
npm run build
```

The build uses the selected API URL from the environment or `.env.local`. You can also override it for a single build:

```bash
REACT_APP_API_BASE_URL=http://127.0.0.1:18080 npm run build
```

Rebuild when changing the API URL for deployed static assets; changing the hosting server's environment alone does not update an existing bundle. The output goes to `todo-app-frontend/build/`. For a manual host build, deploy those assets separately. Compose builds and serves its own production assets through Nginx with `/api`. Loopback URLs are for local use; deployed clients need a backend URL they can reach.

## API Overview

All request and response bodies below use JSON. IDs are generated UUID strings. GET returns a list, POST and PATCH return a single record, and DELETE returns no body.

| Method | Endpoint | Request body | Success |
| --- | --- | --- | --- |
| GET | `/tasks` | None | 200, task array |
| POST | `/tasks` | `{"title":"Learn FastAPI"}` | 201, task |
| PATCH | `/tasks/{task_id}` | `{"title":"Learn SQLAlchemy","completed":true}` | 200, task |
| DELETE | `/tasks/{task_id}` | None | 204 |
| GET | `/categories` | None | 200, category array |
| POST | `/categories` | `{"name":"Study"}` | 201, category |
| PATCH | `/categories/{category_id}` | `{"name":"Backend","complete":true}` | 200, category |
| DELETE | `/categories/{category_id}` | None | 204 |

Example task creation response:

```json
{
  "id": "c70c9c52-5c99-4e52-94a0-a6a5e80141dc",
  "title": "Learn FastAPI",
  "completed": false
}
```

Example category creation response:

```json
{
  "id": "426598c4-7bb0-4c76-b79f-e70cacaf40bb",
  "name": "Study",
  "complete": false
}
```

Create requires `title` for tasks or `name` for categories. Supplied titles and names are trimmed; empty or whitespace-only values return 422 on create or update. Both start incomplete. PATCH fields are optional: omitted or `null` fields remain unchanged, and either `true` or `false` can update completion. Note the different field names: task **`completed`**, category **`complete`**.

Missing records on PATCH/DELETE return 404, for example `{"detail":"Task not found"}` or `{"detail":"Category not found"}`. Invalid request data returns 422 with FastAPI validation details. There is no GET-by-ID endpoint, server-side filtering, search, or pagination.

Try the default Compose API:

```bash
curl -X POST http://127.0.0.1:18080/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Try the API"}'
curl http://127.0.0.1:18080/tasks
```

## Redis Caching

The services implement cache-aside reads for `/tasks` and `/categories`:

1. A **hit** returns the cached JSON list, including a cached empty list, without querying the repository.
2. A **miss** loads records from PostgreSQL, serializes them, and stores the list in Redis.
3. Each stored list expires after **3600 seconds**. Hits do not renew the TTL.
4. Successful create, update, and delete operations commit the database transaction, then invalidate the affected list. The next GET reloads it.

| Resource | Cache key | Invalidation |
| --- | --- | --- |
| Tasks | `cache:tasks_list` | Task create, update, and delete |
| Categories | `cache:categories_list` | Category create, update, and delete |

Deleting a category invalidates only the category cache; tasks and their cache are unchanged. Failed database commits roll back and leave the cache unchanged. Direct database edits do not trigger invalidation and can remain invisible in cached lists until expiration.

Redis is a required runtime dependency: the application does not implement a fallback for Redis outages. Cache invalidation happens after the database commit, so a Redis failure can occur after a write has already persisted. Use a separate Redis database or instance for each application environment because the cache keys are fixed.

## Testing

### Backend unit and API tests

From the repository root, after installing backend dependencies:

```bash
cd todo-app-backend
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

`pytest.ini` excludes tests marked `integration` or `browser` by default. The suite covers service transactions, cache serialization/invalidation, session cleanup, HTTP contracts, CORS, and Uvicorn startup. It uses temporary SQLite databases and mocked Redis; no PostgreSQL or Redis server or manually supplied test credentials are required. Fixtures override the application connection settings.

The startup test binds a loopback socket and passes its file descriptor to a Uvicorn subprocess; run it on Linux/WSL 2 with local socket access.

### PostgreSQL and Redis integration tests

From the same backend directory and virtual environment:

```bash
docker info
python -m pytest -q -m integration tests/integration
```

These tests require the Docker CLI, a running local daemon, permission to access it, and access to pull `postgres:16-alpine` and `redis:7-alpine` if they are not cached. They do not require the application Compose stack to be running.

Each run creates uniquely named containers on random loopback ports with temporary storage. Each test receives its own PostgreSQL database, Redis key prefix, and Uvicorn process. Tests cover real HTTP CRUD, committed persistence, cache hits under database locks, invalidation, failed commits, and expiration with a shortened test TTL. Cleanup targets only resources owned by the tests, leaving development containers and volumes alone.

See the [integration test guide](todo-app-backend/tests/integration/README.md) for fixture lifecycle, ownership checks, and cleanup details.

### Frontend tests

After `npm ci`, run from `todo-app-frontend`:

```bash
npm test -- --watchAll=false --runInBand
```

Use `npm test` for watch mode. Tests mock Axios and cover CRUD request contracts, API URL configuration and fallback, filters, ordering, drafts, feedback, and keyboard/focus behavior. They do not require a running backend or database and are not browser-to-database end-to-end tests.

### Optional real-browser smoke test

With backend development dependencies (`requirements-dev.txt`) and frontend `npm ci` already installed, run from `todo-app-backend` with the virtual environment active:

```bash
python -m pip install -r tests/integration/requirements-browser.txt
python -m playwright install chromium
python -m pytest -q -m browser tests/integration/test_browser.py
```

This single Chromium journey builds the production frontend into a temporary directory and uses the existing isolated Docker PostgreSQL/Redis fixtures plus the actual FastAPI server. It checks task/category CRUD, page-reload persistence against committed SQL data, blank input, failed writes, load failures, retry, and records deleted by another client. Successful API responses are not mocked; a browser route abort simulates the list-network failure. No development services, real env files, or existing frontend build are used or changed.

The browser dependency is optional and excluded from the backend image. Linux may need the system libraries listed in the [Playwright browser setup guide](https://playwright.dev/python/docs/browsers#install-system-dependencies). Ordinary unit and integration commands do not run this smoke test. To run integration and browser checks together, use `python -m pytest -q -m "integration or browser" tests/integration`.

### Optional Compose verification utilities

The scripts in [docker/verification/](todo-app-backend/docker/verification/) cover deployment behavior outside the pytest fixtures. They are excluded from the application image and are not required for startup:

- `check_stack.py` runs inside a backend container through `python -m docker.entrypoint python - STAGE < check_stack.py` (provide the script via stdin using `docker compose exec -T backend`). Its `crud` stage checks HTTP/SQL/cache behavior; `seed` prints records to preserve as JSON, and `persisted` takes that JSON as its next argument after container recreation with the same PostgreSQL volume and an empty Redis cache.
- `check_frontend.py FRONTEND_ORIGIN` runs on the host with the optional browser dependencies. It checks Nginx `/api` routing, SPA reloads, API error responses, and browser CRUD against a Compose deployment.

Run these write checks only against a dedicated disposable test stack, with explicitly selected project/configuration and test data. They are separate from normal startup and the default test suite.

## Current Scope

- No authentication, user accounts, or per-user data isolation.
- No relationship between tasks and categories.
- No server-side search, pagination, or persisted display order.
- No automated database migrations; initialization only creates missing tables.
- No runtime API URL configuration for already-built static assets; the Docker frontend uses the same-origin `/api` proxy.
- No Redis outage fallback or atomic transaction spanning PostgreSQL and Redis.

## Credits

The React frontend originated from the [todo-app-frontend learning template](https://github.com/makedonsky-it/todo-app-frontend).
