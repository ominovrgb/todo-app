"""Own every external resource used here; never discover/reuse development services."""
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import time
from types import SimpleNamespace
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

import psycopg
from psycopg import sql
import pytest
from redis import Redis
from sqlalchemy import create_engine
from sqlalchemy.engine import URL


BACKEND = Path(__file__).resolve().parents[2]
OWNER_LABEL = 'todo.integration.owner'


# Override the parent unit-test transport doubles ONLY in this directory.
@pytest.fixture(autouse=True)
def forbid_postgres_connections():
    pass


@pytest.fixture(autouse=True)
def redis_stub():
    pass


def docker(*args, timeout=120):
    result = subprocess.run(
        ['docker', *args], capture_output=True, text=True, timeout=timeout,
    )
    if result.returncode:
        raise RuntimeError(f'Docker {args[0]} failed: {result.stderr.strip()}')
    return result.stdout.strip()


def wait_for_service(check, description, timeout=60):
    deadline = time.monotonic() + timeout
    while True:
        try:
            check()
            return
        except (psycopg.OperationalError, OSError, ConnectionError) as error:
            if time.monotonic() >= deadline:
                raise RuntimeError(f'{description} did not become ready') from error
            time.sleep(0.2)


@pytest.fixture(scope='session')
def containers():
    if not shutil.which('docker'):
        pytest.fail('Integration infrastructure unavailable: Docker CLI is not installed', pytrace=False)
    try:
        docker('info', '--format', '{{.ServerVersion}}', timeout=15)
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        pytest.fail(f'Integration infrastructure unavailable: {error}', pytrace=False)

    token = uuid4().hex
    password = secrets.token_hex(16)
    names = []

    def start(kind, image, internal_port, options, command=()):
        name = f'todo-integration-{token}-{kind}'
        names.append(name)  # Also clean up partial startup failures.
        container_id = docker(
            'create', '--name', name, '--label', f'{OWNER_LABEL}={token}',
            '--publish', f'127.0.0.1::{internal_port}',
            *options, image, *command,
        )
        docker('start', container_id)
        info = json.loads(docker('inspect', container_id))[0]
        binding = info['NetworkSettings']['Ports'][f'{internal_port}/tcp'][0]
        assert binding['HostIp'] == '127.0.0.1'
        return int(binding['HostPort'])

    try:
        pg_port = start('postgres', 'postgres:16-alpine', 5432, [
            '--tmpfs', '/var/lib/postgresql/data:rw',
            '--env', 'POSTGRES_USER=integration',
            '--env', f'POSTGRES_PASSWORD={password}',
            '--env', 'POSTGRES_DB=postgres',
        ])
        redis_port = start('redis', 'redis:7-alpine', 6379, [
            '--tmpfs', '/data:rw',
        ], ['redis-server', '--save', '', '--appendonly', 'no'])
        pg = dict(host='127.0.0.1', port=pg_port, user='integration', password=password, connect_timeout=2)

        def postgres_ready():
            with psycopg.connect(**pg, dbname='postgres') as connection:
                connection.execute('SELECT 1')

        wait_for_service(postgres_ready, 'PostgreSQL')
        # Redis exceptions have their own hierarchy, so handle readiness explicitly.
        from redis.exceptions import RedisError

        redis_url = f'redis://127.0.0.1:{redis_port}/0'
        with Redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2) as client:
            deadline = time.monotonic() + 30
            while True:
                try:
                    assert client.ping()
                    break
                except RedisError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(0.2)
        yield SimpleNamespace(pg=pg, redis_url=redis_url)
    finally:
        cleanup_errors = []
        for name in reversed(names):
            try:
                inspection = subprocess.run(
                    ['docker', 'inspect', name], capture_output=True, text=True, timeout=15,
                )
                if inspection.returncode:
                    if 'No such object' in inspection.stderr or 'No such container' in inspection.stderr:
                        continue
                    raise RuntimeError(inspection.stderr.strip())
                info = json.loads(inspection.stdout)[0]
                if info['Config']['Labels'].get(OWNER_LABEL) != token:
                    raise RuntimeError(f'Refusing to remove container with mismatched owner: {name}')
                # No volume deletion or global cleanup commands. Data lives in tmpfs.
                docker('rm', '--force', info['Id'], timeout=30)
            except Exception as error:
                cleanup_errors.append(f'{name}: {error}')
        if cleanup_errors:
            pytest.fail('Integration container cleanup failed: ' + '; '.join(cleanup_errors))


@pytest.fixture
def infrastructure(containers):
    from app.models.base import Base
    from app.models.category import CategoryORM
    from app.models.task import TaskORM

    token = uuid4().hex
    database = 'integration_' + token
    prefix = 'integration:' + token
    with psycopg.connect(**containers.pg, dbname='postgres', autocommit=True) as admin:
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(database)))
    engine = None
    try:
        with psycopg.connect(**containers.pg, dbname='postgres', autocommit=True) as admin:
            admin.execute(sql.SQL("ALTER DATABASE {} SET statement_timeout = '1500ms'").format(sql.Identifier(database)))
        database_url = URL.create(
            'postgresql+psycopg', username=containers.pg['user'], password=containers.pg['password'],
            host=containers.pg['host'], port=containers.pg['port'], database=database,
        )
        engine = create_engine(database_url)
        Base.metadata.create_all(engine)
        with Redis.from_url(containers.redis_url, decode_responses=True, socket_timeout=3) as cache:
            yield SimpleNamespace(
                pg={**containers.pg, 'dbname': database},
                database_url=database_url.render_as_string(hide_password=False),
                redis_url=containers.redis_url, cache=cache, prefix=prefix,
            )
            keys = list(cache.scan_iter(match=prefix + ':*'))
            if keys:
                cache.delete(*keys)
    finally:
        if engine is not None:
            engine.dispose()
        with psycopg.connect(**containers.pg, dbname='postgres', autocommit=True) as admin:
            admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(database)))


class API:
    def __init__(self, port):
        self.base_url = f'http://127.0.0.1:{port}'

    def request(self, method, path, payload=None):
        data = None if payload is None else json.dumps(payload).encode()
        request = Request(self.base_url + path, data=data, method=method, headers={'Content-Type': 'application/json'})
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            body = response.read()
            content = json.loads(body) if body and 'application/json' in response.headers.get('Content-Type', '') else body.decode()
            return response.status, content


@pytest.fixture
def cache_ttl():
    return 60


@pytest.fixture
def api(infrastructure, cache_ttl, tmp_path):
    env = dict(os.environ)
    env.update(
        DATABASE_URL=infrastructure.database_url,
        REDIS_URL=infrastructure.redis_url,
        INTEGRATION_CACHE_TTL=str(cache_ttl),
        INTEGRATION_CACHE_PREFIX=infrastructure.prefix,
    )
    with socket.socket() as listener, (tmp_path / 'integration-server.log').open('w+') as log:
        listener.bind(('127.0.0.1', 0))
        listener.listen()
        api = API(listener.getsockname()[1])
        env['INTEGRATION_SERVER_FD'] = str(listener.fileno())
        process = subprocess.Popen(
            [sys.executable, '-c', "import runpy; runpy.run_path('tests/integration/server.py', run_name='__main__')"],
            cwd=BACKEND, env=env, pass_fds=(listener.fileno(),), stdout=log, stderr=log,
        )
        try:
            deadline = time.monotonic() + 15
            while True:
                try:
                    assert api.request('GET', '/openapi.json')[0] == 200
                    break
                except (URLError, TimeoutError):
                    if process.poll() is not None or time.monotonic() >= deadline:
                        log.seek(0)
                        pytest.fail('Integration API startup failed:\n' + log.read())
                    time.sleep(0.05)
            yield api
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
