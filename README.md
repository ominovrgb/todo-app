# ToDo App

**A full-stack task management application built with FastAPI, React, and PostgreSQL.**

A learning project focused on REST API development, relational databases, and layered backend architecture.

![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-D71F00?style=flat-square)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)

---

## Overview

ToDo App provides a React interface for managing tasks and categories through a FastAPI REST API.

The backend follows a **Layered Architecture**, separating HTTP handling, business logic, database operations, and configuration.

PostgreSQL provides persistent storage, while SQLAlchemy handles database interactions.

### Features

- **Task Management** — create, view, update, and delete tasks
- **Completion Tracking** — mark tasks as completed or pending
- **Category Management** — create, rename, update, and delete categories
- **Persistent Storage** — PostgreSQL with Docker volumes
- **Layered Architecture** — routers, services, repositories, and database
- **Dependency Injection** — FastAPI's `Depends()`
- **Validation** — Pydantic request and response schemas
- **Error Handling** — HTTP 404 for missing resources
- **Automated Tests** — 30 tests covering backend functionality
- **API Documentation** — interactive Swagger UI

---

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Backend | Python, FastAPI, Pydantic |
| Frontend | React, JavaScript, Axios, CSS |
| Database | PostgreSQL |
| ORM | SQLAlchemy |
| Database Driver | psycopg 3 |
| Testing | Automated backend tests |
| Development | Docker, Git, Uvicorn |

## Architecture

The backend separates responsibilities into independent layers.

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
      |
      v
Docker Volume
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

Database transactions are committed at the service layer. Repositories focus on data access without managing commits.

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
│   ├── .env                  # Local configuration (ignored)
│   ├── .venv/                # Virtual environment (ignored)
│   └── requirements.txt
│
├── todo-app-frontend/
│   ├── public/
│   ├── src/
│   ├── package.json
│   └── package-lock.json
│
├── .gitignore
└── README.md
```

Local dependencies, virtual environments, and `.env` files are excluded from version control.

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js and npm
- Docker Desktop with WSL 2 integration, or Docker Engine on Linux

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

Replace `YOUR_PASSWORD` with your own local password.

The application loads environment variables through `python-dotenv`.

**Never commit your `.env` file or real credentials.**

### 3. Initialize Database Tables

For a **new, empty database**, create the required tables once:

```bash
python -c "from app.db.session import engine; from app.models.base import Base; from app.models.task import TaskORM; from app.models.category import CategoryORM; Base.metadata.create_all(bind=engine)"
```

This step is unnecessary if the tables already exist.

The application no longer creates tables automatically at startup. Future schema changes should be managed through database migrations.

### 4. Start the Backend

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

PostgreSQL, FastAPI, and React must be running to use the full application.

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

Missing tasks or categories return HTTP 404. Successful deletions return HTTP 204.

---

## Testing

The backend includes **30 automated tests** covering:

- Task and category CRUD
- Request and response validation
- HTTP status codes
- Partial updates, including boolean `false`
- Missing resources and 404 responses
- Database transaction handling and rollback
- CORS configuration
- OpenAPI schema and application startup

The automated API tests use isolated database session substitutes. The application has also been manually checked through the React frontend with PostgreSQL.

## Database & Persistence

Tasks and categories are stored in PostgreSQL using SQLAlchemy ORM.

- Database sessions are managed using FastAPI dependencies.
- Services manage commits and rollbacks.
- Repositories handle ORM queries.
- Docker volumes provide persistent storage across container restarts.

The current development database uses a Docker volume. Removing a container does not automatically reconnect a new container to its previous anonymous volume.

---

## Current Limitations

- No authentication or user accounts
- No automated database migrations
- No production deployment
- No Docker Compose configuration yet

---

## Credits

The React frontend is based on the [todo-app-frontend learning template](https://github.com/makedonsky-it/todo-app-frontend).

The backend, PostgreSQL integration, SQLAlchemy implementation, layered architecture refactoring, and category-completion extension were developed as part of a Python Backend learning project.