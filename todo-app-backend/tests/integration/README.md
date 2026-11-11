# Real PostgreSQL and Redis integration tests

From `todo-app-backend`, install development dependencies and run the existing
suite (does not start containers):

```sh
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

Run integration tests separately:

```sh
python -m pytest -q -m integration tests/integration
```

Requires a local Docker daemon, permission to use it, and the backend's
`requirements-dev.txt` dependencies. Docker pulls `postgres:16-alpine` and `redis:7-alpine` if
missing. No additional Python test packages are needed. Infrastructure failures
fail the integration run explicitly; they are not silently skipped.

Each run owns two uniquely named, ownership-labelled containers with random
localhost ports and tmpfs data directories. Each test gets a fresh PostgreSQL
database, a Redis key prefix, and a Uvicorn process. The application runs with
process-local test settings, including its TTL, through `server.py`. Unit-test
transport doubles are overridden only inside this directory.

Cleanup terminates the API, drops only the test's database, deletes only its Redis
keys, and removes containers only after verifying their ownership label. No
development container, `.env`, named volume, or Docker prune command is used.
Normal failures and startup failures run cleanup. An uncatchable process kill or
Docker daemon failure can leave containers named `todo-integration-<run-id>-*`;
cleanup errors identify them. Image downloads remain in Docker's image cache.

The suite covers both resources' HTTP CRUD and committed persistence, Redis JSON
content, empty and populated cache hits under PostgreSQL table locks, write
invalidation, deferred PostgreSQL commit failures, and actual TTL expiration.
Tables are created from ORM metadata because the project has no migration suite.
Concurrent cache races, Redis outages, deployment migrations, and immediate
consistency after out-of-band database changes are outside this suite's scope.
