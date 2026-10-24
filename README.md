# ToDo App — FastAPI + React

A full-stack learning project for managing tasks and categories through a REST API.

The backend was built with **Python, FastAPI, and Pydantic**. The frontend uses **React** and **Axios**.

## Features

- Create, view, edit, and delete tasks
- Mark tasks as completed or pending
- Create, view, rename, and delete categories
- Toggle completion status for categories (an extension to the original exercise)
- UUID identifiers for tasks and categories
- Interactive API documentation via FastAPI Swagger UI

## Tech stack

| Backend | Frontend |
| --- | --- |
| Python | JavaScript |
| FastAPI | React |
| Pydantic | Axios |
| Uvicorn | CSS |

## Project structure

```text
todo-app/
├── todo-app-backend/
│   ├── main.py
│   └── requirements.txt
├── todo-app-frontend/
│   ├── public/
│   ├── src/
│   └── package.json
└── README.md
```

## Run locally

Prerequisites: **Python 3.10+**, **Node.js**, and **npm**.

### Backend

Open a terminal in `todo-app-backend`.

Windows PowerShell:

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m uvicorn main:app --reload --port 8080
```

Backend: http://localhost:8080  
Swagger UI: http://localhost:8080/docs

### Frontend

Open a second terminal in `todo-app-frontend`.

Windows PowerShell:

```powershell
npm.cmd install
npm.cmd run dev
```

Open http://localhost:3000.

Both servers must remain running while using the app.

## API endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/tasks` | List tasks |
| POST | `/tasks` | Create a task |
| PATCH | `/tasks/{task_id}` | Update task title or completion status |
| DELETE | `/tasks/{task_id}` | Delete a task |
| GET | `/categories` | List categories |
| POST | `/categories` | Create a category |
| PATCH | `/categories/{category_id}` | Update category name or completion status |
| DELETE | `/categories/{category_id}` | Delete a category |

Example task creation:

```json
{ "title": "Learn FastAPI" }
```

Example category update:

```json
{ "name": "Study", "complete": true }
```

## Current limitations

- Tasks and categories are stored **in memory**, so data is lost after a backend restart.
- No database, authentication, or deployment is included.

## Credits

The React frontend is based on the [todo-app-frontend learning template](https://github.com/makedonsky-it/todo-app-frontend). The backend and category-completion extension were implemented as part of a FastAPI practice project.
