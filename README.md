# ToDo App

**A full-stack task management application built with FastAPI, React, and PostgreSQL.**

A portfolio learning project focused on REST API development, layered backend architecture, relational databases, and responsive React interfaces.

![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-D71F00?style=flat-square)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)

---

## Overview

ToDo App is a compact, playful retro-style productivity application for managing tasks and categories through a React frontend and FastAPI REST API.

The pastel interface combines a pale blue dotted background, cream cards, dark outlines, offset shadows, and rounded controls. Mint completion states and pink and yellow accents highlight actions and progress. A centered layout adapts to desktop and mobile screens.

The backend follows a **Layered Architecture**, separating HTTP handling, business logic, database operations, and configuration.

PostgreSQL provides persistent storage, while SQLAlchemy handles database interactions.

### Features

- **View Navigation** — Tasks and Categories views with counts in the header and a responsive layout
- **Task Management** — create, edit, delete, and mark tasks as active or completed
- **Task Filters** — All, Active, and Completed views with counts calculated from loaded data
- **Stable Task Ordering** — existing tasks retain their relative order across refetches within the current session; newly discovered tasks append to the list
- **Category Management** — create, rename, delete, and toggle category completion
- **Refined Editing** — separate drafts for each view, Enter to submit, Escape to cancel editing, and protection against duplicate submissions
- **Request Feedback** — loading skeletons, empty states, refresh and retry controls, success notifications, and actionable errors
- **Accessible Controls** — labeled inputs and buttons, visible keyboard focus, a skip link, status announcements, and focus restoration
- **Motion and Styling** — pastel colors, subtle control transitions, loading indicators, and reduced-motion support
- **Persistent Storage** — PostgreSQL through SQLAlchemy, with a Docker volume in the local setup below
- **Layered Backend** — routers, services, repositories, dependency injection, and Pydantic validation
- **Automated Tests** — backend API and service tests, plus frontend interaction tests
- **API Documentation** — interactive Swagger UI

---

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Backend | Python, FastAPI, Pydantic, pydantic-settings |
| Frontend | React 19, JavaScript, Axios, CSS, Create React App (react-scripts) |
| Database | PostgreSQL |
| ORM | SQLAlchemy |
| Database Driver | psycopg 3 |
| Backend Testing | pytest, unittest.mock |
| Frontend Testing | Jest, React Testing Library, jest-dom, user-event |
| Development | Docker, Git, Uvicorn |

## Architecture

The backend follows **Router → Service → Repository → SQLAlchemy → PostgreSQL**.

```text
React Frontend
      |
      | HTTP / Axios
      v
FastAPI Router
      |
      | Dependency Injection
      v
Service Layer
      |
      | Business Logic & Transactions
      v
Repository Layer
      |
      | SQLAlchemy ORM
      v
PostgreSQL Database
```

### Layer Responsibilities

| Layer | Responsibility |
| --- | --- |
| Router | HTTP requests, responses, and status codes |
| Service | Business logic, validation, and transactions |
| Repository | Database queries and ORM operations |
| Models | SQLAlchemy database models |
| Schemas | Pydantic request and response validation |
| Database | Engine and session management |
| Core | Application configuration |

Services commit successful writes and roll back failures. Repositories handle data access without committing transactions. FastAPI dependencies provide a database session per request and close it afterward.

### Frontend Architecture

The frontend is a React single-page application built with `react-scripts`. `src/index.js` mounts `App` in React Strict Mode. The application UI, shared components, `useCollection` hook, and `preserveCollectionOrder` helper currently live in `src/App.js`.

| Part | Responsibility |
| --- | --- |
| `App` | View selection, task filters, form drafts, editing, CRUD handlers, and focus management |
| `useCollection` | Independent task/category data, loading and error state, refreshes, feedback, and pending mutations |
| `preserveCollectionOrder` | Reconcile fresh data by ID while retaining existing order and appending newly discovered records |
| Shared components | Record rows, feedback notices, loading skeletons, empty states, and SVG icons |
| `index.css` | Theme variables, typography, global styles, and keyboard focus indicators |
| `App.css` | Compact layout, responsive breakpoints, card and control styles, and motion |

Header navigation and task filtering use local React state. Both collections load through Axios; successful `POST`, `PATCH`, and `DELETE` requests trigger a fresh `GET` for the affected collection. Pending operations disable conflicting controls, failed saves preserve drafts, and failed refreshes retain the last loaded list and counts.

Task ordering is stable across refetches within the current session. `preserveCollectionOrder` keeps surviving IDs in their existing relative order, updates their data, removes missing records, and appends newly discovered IDs in response order. Completion changes and edits do not move tasks in the All view; filtered views retain the relative order of matching tasks. This order exists only in React memory: a full page reload starts from the next API response, so order is not guaranteed across reloads.

Axios calls FastAPI directly at `http://localhost:8080`, defined by `API_BASE_URL` in `src/App.js`. FastAPI allows the local frontend origins through CORS. Tasks use `title` and `completed`; categories use `name` and `complete`. Categories are standalone records and are not assigned to tasks.

## Project Structure

```text
todo-app/
├── todo-app-backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routers/
│   │   │   │   ├── task.py
│   │   │   │   └── category.py
│   │   │   └── dependencies.py
│   │   ├── core/
│   │   │   └── config.py
│   │   ├── db/
│   │   │   └── session.py
│   │   ├── models/
│   │   │   ├── base.py
│   │   │   ├── task.py
│   │   │   └── category.py
│   │   ├── schemas/
│   │   │   ├── task.py
│   │   │   └── category.py
│   │   ├── repositories/
│   │   │   ├── task.py
│   │   │   └── category.py
│   │   ├── services/
│   │   │   ├── task.py
│   │   │   └── category.py
│   │   └── main.py
│   ├── tests/
│   │   ├── test_tasks.py
│   │   ├── test_categories.py
│   │   ├── test_api.py
│   │   └── test_startup.py
│   └── requirements.txt
│
├── todo-app-frontend/
│   ├── public/
│   │   ├── index.html        # HTML entry point and page metadata
│   │   ├── manifest.json
│   │   └── robots.txt
│   ├── src/
│   │   ├── App.js            # App UI, shared components, and collection helpers
│   │   ├── App.css           # Layout, components, responsive styles, and motion
│   │   ├── App.test.js       # Frontend interaction and ordering tests
│   │   ├── index.js          # React entry point
│   │   ├── index.css         # Theme variables and global styles
│   │   ├── reportWebVitals.js
│   │   └── setupTests.js     # jest-dom setup
│   ├── package.json
│   └── package-lock.json
│
├── .gitignore
└── README.md
```

The tree lists the tracked application files. Local `.env` files, `.venv/`, `node_modules/`, and generated builds are excluded from version control.

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js and npm (the repository does not pin a Node.js version)
- Docker Desktop with WSL 2 integration, or Docker Engine on Linux, for the PostgreSQL setup below

The commands below use Ubuntu/Linux, including Ubuntu on WSL 2.

### 1. Start PostgreSQL

For a new installation, create a PostgreSQL 18 container with persistent storage:

```bash
docker run -d \
  --name pg-container \
  -e POSTGRES_PASSWORD=YOUR_PASSWORD \
  -p 15432:5432 \
  -v todo_postgres_data:/var/lib/postgresql \
  postgres:18
```

Replace `YOUR_PASSWORD` with your own local database password.

If the container already exists:

```bash
docker start pg-container
```

Verify its status:

```bash
docker ps
```

### 2. Set Up the Backend

From the project root:

```bash
cd todo-app-backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Create a `.env` file inside `todo-app-backend`:

```dotenv
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@127.0.0.1:15432/postgres
```

Use the same password as the PostgreSQL container. Percent-encode any URL-reserved characters in the password when placing it in `DATABASE_URL`.

Configuration is loaded through **Pydantic Settings** (`pydantic-settings`); see [Configuration](#configuration) below.

**Never commit your `.env` file or real credentials.**

### 3. Initialize Database Tables

For a **new, empty database**, create the required tables once:

```bash
python -c "from app.db.session import engine; from app.models.base import Base; from app.models.task import TaskORM; from app.models.category import CategoryORM; Base.metadata.create_all(bind=engine)"
```

Run this from `todo-app-backend` with the virtual environment active and PostgreSQL running. It is unnecessary if the tables already exist.

The application does not create or alter tables at startup. `create_all` creates missing tables; it does not migrate existing schemas. Automated migrations are not implemented.

### 4. Start the Backend

In the same backend directory with the virtual environment active:

```bash
python -m uvicorn app.main:app --reload --port 8080
```

**Backend:** http://localhost:8080

**Swagger UI:** http://localhost:8080/docs

### 5. Start the Frontend

Open a second terminal. From the project root:

```bash
cd todo-app-frontend
npm install
npm run dev
```

**Frontend:** http://localhost:3000

Keep the frontend on port `3000` to match the default CORS origins. PostgreSQL, FastAPI, and the React development server must be running to use the full application.

To create a frontend build, run this from `todo-app-frontend`:

```bash
npm run build
```

This generates static assets in `build/`; serving or deploying them requires a separate setup.

---

## Configuration

`app/core/config.py` defines a `Settings` class that inherits from `pydantic_settings.BaseSettings`. Its `model_config` uses `SettingsConfigDict` to load `todo-app-backend/.env` through an absolute path derived from the configuration file. Environment variables take precedence over values in that file.

| Setting | Type | Default / requirement |
| --- | --- | --- |
| `DATABASE_URL` | String | Required SQLAlchemy connection URL; use `postgresql+psycopg://` for PostgreSQL |
| `cors_allowed_origins` | List of strings | `["http://localhost:3000", "http://127.0.0.1:3000"]` |

`get_settings()` caches the settings instance with `lru_cache`. Settings are validated when loaded; restart the backend after changing configuration. To override the CORS list through an environment variable or `.env`, provide a JSON array, for example:

```dotenv
CORS_ALLOWED_ORIGINS='["http://localhost:3000","http://127.0.0.1:3000"]'
```

The frontend API address is currently a constant in `src/App.js`, not a frontend environment variable. If the backend address changes, update that constant; if the frontend origin changes, update the backend CORS setting.

---

## API Reference

### Tasks

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/tasks` | Retrieve all tasks |
| `POST` | `/tasks` | Create a task |
| `PATCH` | `/tasks/{task_id}` | Update a task |
| `DELETE` | `/tasks/{task_id}` | Delete a task |

### Categories

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/categories` | Retrieve all categories |
| `POST` | `/categories` | Create a category |
| `PATCH` | `/categories/{category_id}` | Update a category |
| `DELETE` | `/categories/{category_id}` | Delete a category |

### Request Schemas

| Operation | JSON body fields |
| --- | --- |
| Create task | `title`: required string |
| Update task | `title`: optional string or `null`; `completed`: optional boolean or `null` |
| Create category | `name`: required string |
| Update category | `name`: optional string or `null`; `complete`: optional boolean or `null` |

PATCH requests update only supplied, non-null fields; omitted and `null` fields remain unchanged. Both `true` and `false` are supported for completion updates. GET and DELETE requests require no JSON body.

### Example Requests

**Create a task — POST `/tasks`**

```json
{
  "title": "Learn FastAPI"
}
```

**Update a task — PATCH `/tasks/{task_id}`**

```json
{
  "title": "Learn SQLAlchemy",
  "completed": true
}
```

**Create a category — POST `/categories`**

```json
{
  "name": "Study"
}
```

**Update a category — PATCH `/categories/{category_id}`**

```json
{
  "name": "Backend Development",
  "complete": true
}
```

List and update requests return HTTP 200; creation returns HTTP 201. Task responses contain `id`, `title`, and `completed`; category responses contain `id`, `name`, and `complete`. New records start with completion set to `false`. Missing tasks or categories return HTTP 404, invalid request data returns HTTP 422, and successful deletions return HTTP 204 with no body.

---

## Testing

### Backend

From the project root, after installing the backend dependencies and configuring `DATABASE_URL`:

```bash
cd todo-app-backend
source .venv/bin/activate
python -m pytest tests -q
```

| Test file | Coverage |
| --- | --- |
| `test_tasks.py` | Task service CRUD, serialization, partial updates, missing records, commits, and rollback |
| `test_categories.py` | Category service CRUD, completion updates, missing records, commits, and rollback |
| `test_api.py` | ASGI request validation, response bodies and status codes, all eight CRUD operations, and CORS |
| `test_startup.py` | Uvicorn startup/shutdown, OpenAPI, and Swagger UI |

The tests use mocked SQLAlchemy sessions and do not require a running PostgreSQL server. A valid `DATABASE_URL` is still required because application imports initialize settings and the engine. The startup test launches a local Uvicorn process and binds a loopback socket; it uses Unix file-descriptor passing and is intended for Linux/WSL. These tests do not verify queries against a real PostgreSQL database.

### Frontend

From the project root, after installing the frontend dependencies:

```bash
cd todo-app-frontend
npm test -- --watchAll=false --runInBand
```

For interactive watch mode, run `npm test` in the frontend directory.

`src/App.test.js` contains **46 tests in one suite**, using Jest and React Testing Library with mocked Axios requests. Coverage includes:

- Task and category CRUD payloads, completion toggles, filters, and counts
- Stable task ordering with reordered UUID responses, fresh data after edits, survivor order after deletion, and appending new tasks
- Loading, empty states, validation errors, retry, and refresh failures
- Draft preservation, minimal PATCH requests, and duplicate-submission prevention
- Keyboard submission/cancellation, focus and caret stability, nearby focus restoration after deletion without scrolling, and IME composition
- Controls locked through mutations and silent refetches, notification behavior, and absence of list fades with and without reduced-motion preferences

Frontend tests run without FastAPI or PostgreSQL. They verify component interactions and request contracts, not full browser-to-database integration.

## Database & Persistence

Tasks and categories are stored in PostgreSQL using SQLAlchemy ORM.

- Database sessions are managed using FastAPI dependencies.
- Services manage commits and rollbacks.
- Repositories handle ORM queries.
- The setup above mounts the named volume `todo_postgres_data` at `/var/lib/postgresql` for PostgreSQL 18. Reuse the same volume when recreating that container to retain its data.

---

## Current Limitations

- No authentication or user accounts
- Categories cannot be assigned to tasks
- Task filtering is local; there is no server-side search or pagination
- The frontend API URL is configured in source
- No automated database migrations or Alembic configuration
- No production deployment, Docker Compose configuration, Redis integration, or CI/CD pipeline

---

## Credits

The React frontend is based on the [todo-app-frontend learning template](https://github.com/makedonsky-it/todo-app-frontend).

The backend, PostgreSQL integration, SQLAlchemy implementation, layered architecture refactoring, and category-completion extension were developed as part of a Python Backend learning project.