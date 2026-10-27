# ToDo App

**A full-stack task management application built with FastAPI, React, and PostgreSQL.**

A learning project focused on REST API development, database integration, and connecting a Python backend with a React frontend.

![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-D71F00?style=flat-square)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)

---

## Overview

ToDo App allows users to manage tasks and categories through a React interface connected to a FastAPI REST API.

The application uses **SQLAlchemy ORM** with **PostgreSQL** for persistent data storage, replacing the original in-memory implementation.

### Features

- **Task Management** — create, view, update, and delete tasks
- **Completion Tracking** — mark tasks as completed or pending
- **Category Management** — create, rename, update, and delete categories
- **Persistent Storage** — store tasks and categories in PostgreSQL
- **UUID Identifiers** — unique IDs for tasks and categories
- **Data Validation** — Pydantic request and response schemas
- **Error Handling** — HTTP 404 responses for missing resources
- **API Documentation** — interactive Swagger UI

---

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Backend | Python, FastAPI, Pydantic |
| Frontend | React, JavaScript, Axios, CSS |
| Database | PostgreSQL |
| ORM | SQLAlchemy |
| Database Driver | psycopg |
| Development | Docker, Git, Uvicorn |

## Architecture

```text
                  React Frontend
                  localhost:3000
                        |
                        | HTTP / Axios
                        v
                  FastAPI Backend
                  localhost:8080
                        |
                        | SQLAlchemy ORM
                        v
                   PostgreSQL
                  localhost:15432
                        |
                        v
                   Docker Volume
```

**How it works:**

1. React sends HTTP requests to FastAPI.
2. FastAPI validates incoming data using Pydantic.
3. SQLAlchemy handles database operations.
4. PostgreSQL stores tasks and categories.
5. FastAPI returns JSON responses to the frontend.

## Project Structure

```text
todo-app/
├── todo-app-backend/
│   ├── .venv/                # Python virtual environment (ignored)
│   ├── .env                  # Local environment variables (ignored)
│   ├── main.py               # FastAPI routes and ORM models
│   └── requirements.txt      # Python dependencies
│
├── todo-app-frontend/
│   ├── node_modules/         # Installed npm packages (ignored)
│   ├── public/               # Static assets
│   ├── src/                  # React application
│   ├── package.json          # Dependencies and scripts
│   └── package-lock.json     # Locked dependency versions
│
├── .gitignore                # Git exclusion rules
└── README.md                 # Project documentation
```

**Note:** Virtual environments, installed packages, and local `.env` files are excluded from version control.

---

## Getting Started

### Prerequisites

Make sure you have installed:

- Python 3.10+
- Node.js and npm
- Docker Desktop with WSL 2 integration, or Docker Engine on Linux

The following instructions are intended for Ubuntu/Linux, including Ubuntu on WSL 2.

### 1. PostgreSQL Setup

Start Docker Desktop if using Windows.

For a fresh setup, create a PostgreSQL 18 container with a named volume:

```bash
docker run -d \
  --name pg-container \
  -e POSTGRES_PASSWORD=YOUR_PASSWORD \
  -p 15432:5432 \
  -v todo_postgres_data:/var/lib/postgresql \
  postgres:18
```

Replace `YOUR_PASSWORD` with your own local database password.

If the container already exists, start it instead:

```bash
docker start pg-container
```

Verify that PostgreSQL is running:

```bash
docker ps
```

PostgreSQL is accessible through `localhost:15432`.

The named Docker volume provides persistent data storage across container restarts.

### 2. Backend Setup

From the project root, navigate to the backend:

```bash
cd todo-app-backend
```

Create a virtual environment:

```bash
python3 -m venv .venv
```

Activate it:

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
python -m pip install -r requirements.txt
```

Create a `.env` file inside `todo-app-backend`:

```dotenv
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@127.0.0.1:15432/postgres
```

Replace `YOUR_PASSWORD` with the password configured for your local PostgreSQL container.

The backend loads environment variables using `python-dotenv`.

**Security:** Never commit your `.env` file or real database credentials to Git.

Start FastAPI:

```bash
uvicorn main:app --reload --port 8080
```

SQLAlchemy automatically creates missing tables when the application starts.

**Backend:** http://localhost:8080

**Swagger UI:** http://localhost:8080/docs

### 3. Frontend Setup

Open a second terminal and navigate to the frontend directory from the project root:

```bash
cd todo-app-frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

**Frontend:** http://localhost:3000

The database, backend, and frontend must all be running to use the full application.

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

**Create a task**

`POST /tasks`

```json
{
  "title": "Learn FastAPI"
}
```

**Update a task**

`PATCH /tasks/{task_id}`

```json
{
  "title": "Learn SQLAlchemy",
  "completed": true
}
```

**Create a category**

`POST /categories`

```json
{
  "name": "Study"
}
```

**Update a category**

`PATCH /categories/{category_id}`

```json
{
  "name": "Backend Development",
  "complete": true
}
```

For interactive API testing, use the [Swagger UI](http://localhost:8080/docs) while the backend is running.

---

## Database & Persistence

The application uses **SQLAlchemy ORM** to interact with PostgreSQL.

Its database layer includes:

- ORM models representing database tables
- SQLAlchemy sessions for database operations
- FastAPI dependencies for session management
- Pydantic schemas for data validation
- SQLAlchemy queries for CRUD operations

Tasks and categories remain stored after restarting the FastAPI server.

PostgreSQL runs inside Docker with volume-based persistent storage, allowing data to survive container restarts.

The existing database volume can also be reused when recreating a container.

---

## Current Limitations

- No authentication or user accounts
- No automated database migrations
- No automated test suite
- No production deployment
- No Docker Compose setup yet

These features may be added as the project evolves.

---

## Credits

The React frontend is based on the [todo-app-frontend learning template](https://github.com/makedonsky-it/todo-app-frontend).

The FastAPI backend, PostgreSQL integration, SQLAlchemy ORM implementation, and category-completion extension were implemented as part of a backend development learning project.