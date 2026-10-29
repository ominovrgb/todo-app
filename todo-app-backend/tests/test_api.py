"""Exercise the complete ASGI request stack without a network or a database server."""
import asyncio
import json
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.main import app


def request(method, path, payload=None, headers=()):
    async def run():
        messages = []
        received = False

        async def receive():
            nonlocal received
            if received:
                await asyncio.Event().wait()
            received = True
            return {'type': 'http.request', 'body': json.dumps(payload).encode() if payload is not None else b'', 'more_body': False}

        async def send(message):
            messages.append(message)

        await asyncio.wait_for(app({
            'type': 'http', 'asgi': {'version': '3.0'}, 'http_version': '1.1',
            'method': method, 'scheme': 'http', 'path': path,
            'raw_path': path.encode(), 'root_path': '', 'query_string': b'',
            'headers': [(b'content-type', b'application/json'), *headers],
            'client': ('127.0.0.1', 1234), 'server': ('test', 80),
        }, receive, send), timeout=5)
        start = next(message for message in messages if message['type'] == 'http.response.start')
        body = b''.join(message.get('body', b'') for message in messages if message['type'] == 'http.response.body')
        response_headers = dict(start['headers'])
        content = json.loads(body) if body and b'application/json' in response_headers.get(b'content-type', b'') else (body.decode() if body else None)
        return start['status'], content, response_headers

    return asyncio.run(run())


@pytest.fixture
def database_stub():
    # Simulate storage only; production routers, services, repositories and schemas run.
    rows = {}
    db = MagicMock(spec=Session)

    def add(row):
        row.id = str(uuid4())
        rows[row.id] = row

    db.add.side_effect = add
    db.get.side_effect = lambda model, key: rows.get(key)
    db.scalars.return_value.all.side_effect = lambda: list(rows.values())
    db.delete.side_effect = lambda row: rows.pop(row.id)
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield db
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.parametrize('path,text_field,flag,missing', [
    ('/tasks', 'title', 'completed', 'Task not found'),
    ('/categories', 'name', 'complete', 'Category not found'),
])
def test_crud_http_contract(database_stub, path, text_field, flag, missing):
    assert request('GET', path)[:2] == (200, [])
    assert request('POST', path, {})[0] == 422
    status, created, _ = request('POST', path, {text_field: 'First'})
    assert status == 201
    assert created == {'id': created['id'], text_field: 'First', flag: False}
    resource = f"{path}/{created['id']}"
    assert request('GET', path)[:2] == (200, [created])
    for value in (True, False):
        status, updated, _ = request('PATCH', resource, {flag: value})
        assert status == 200
        assert updated == {**created, flag: value}
    status, updated, _ = request('PATCH', resource, {text_field: 'Renamed'})
    assert status == 200
    assert updated == {**created, text_field: 'Renamed'}
    for payload in ({}, {text_field: None, flag: None}):
        assert request('PATCH', resource, payload)[:2] == (200, updated)
    assert request('PATCH', resource, {flag: 'invalid'})[0] == 422
    assert request('DELETE', resource)[:2] == (204, None)
    assert request('GET', path)[:2] == (200, [])
    assert request('PATCH', resource, {flag: True})[:2] == (404, {'detail': missing})
    assert request('DELETE', resource)[:2] == (404, {'detail': missing})


def test_openapi_has_exactly_eight_crud_operations():
    status, schema, _ = request('GET', '/openapi.json')
    assert status == 200
    operations = {(path, method) for path, methods in schema['paths'].items() for method in methods}
    assert operations == {
        ('/tasks', 'get'), ('/tasks', 'post'),
        ('/tasks/{task_id}', 'patch'), ('/tasks/{task_id}', 'delete'),
        ('/categories', 'get'), ('/categories', 'post'),
        ('/categories/{category_id}', 'patch'), ('/categories/{category_id}', 'delete'),
    }
    operation_ids = [operation['operationId'] for methods in schema['paths'].values() for operation in methods.values()]
    assert len(set(operation_ids)) == 8


@pytest.mark.parametrize('origin', ['http://localhost:3000', 'http://127.0.0.1:3000'])
def test_frontend_cors(origin):
    status, _, headers = request('OPTIONS', '/tasks', headers=[
        (b'origin', origin.encode()), (b'access-control-request-method', b'PATCH'),
    ])
    assert status == 200
    assert headers[b'access-control-allow-origin'] == origin.encode()
