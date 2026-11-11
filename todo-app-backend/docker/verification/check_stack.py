"""Runs inside this task's backend container; never connects to development services."""
import json
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

from redis import Redis
from sqlalchemy import create_engine, text
from app.core.config import get_settings

settings = get_settings()
engine = create_engine(settings.DATABASE_URL)
assert engine.url.host == 'postgres'
assert settings.redis_url == 'redis://redis:6379/0'
cache = Redis.from_url(settings.redis_url, decode_responses=True, socket_timeout=3)


def api(method, path, payload=None):
    request = Request('http://127.0.0.1:8080' + path, method=method,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'})
    try:
        response = urlopen(request, timeout=5)
    except HTTPError as error:
        response = error
    with response:
        body = response.read()
        return response.status, json.loads(body) if body else None


def db_rows(table):
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(text(f'SELECT * FROM {table}')).mappings()]


def check_list(table, key):
    status, rows = api('GET', '/' + table)
    assert status == 200, rows
    assert sorted(rows, key=lambda r:r['id']) == sorted(db_rows(table), key=lambda r:r['id'])
    assert json.loads(cache.get(key)) == rows
    assert 0 < cache.ttl(key) <= settings.cache_ttl_seconds
    with engine.begin() as blocker:
        blocker.execute(text(f'LOCK TABLE {table} IN ACCESS EXCLUSIVE MODE'))
        assert api('GET', '/' + table) == (200, rows), 'Cache hit queried locked database'
    return rows


resources = [('tasks', 'title', 'completed', settings.cache_tasks_key),
             ('categories', 'name', 'complete', settings.cache_category_key)]
stage = sys.argv[1]
if stage == 'crud':
    assert os.getuid() == 10001
    assert not list(Path('/app').rglob('.env*'))
    assert api('GET', '/openapi.json')[0] == 200
    for table, field, flag, key in resources:
        # Existing cache keys belong exclusively to the new Compose Redis container.
        cache.delete(key)
        check_list(table, key)
        status, item = api('POST', '/' + table, {field: 'Compose test ☕ ' + uuid4().hex})
        assert status == 201, item
        assert item[flag] is False
        assert item in db_rows(table)
        assert cache.get(key) is None
        check_list(table, key)
        path = '/' + table + '/' + item['id']
        status, updated = api('PATCH', path, {field: 'Updated', flag: True})
        assert status == 200 and updated[flag] is True
        assert cache.get(key) is None
        check_list(table, key)
        with engine.begin() as connection:
            connection.execute(text(f'UPDATE {table} SET {field}=:value WHERE id=:id'),
                               {'value': 'After expiration', 'id': item['id']})
        assert updated in api('GET', '/' + table)[1], 'Cached result not served'
        cache.expire(key, 1)  # Shorten only this test key; app TTL was checked above.
        deadline = time.monotonic() + 5
        while cache.exists(key):
            assert time.monotonic() < deadline
            time.sleep(0.05)
        rows = check_list(table, key)
        assert {**updated, field: 'After expiration'} in rows
        assert api('DELETE', path) == (204, None)
        assert cache.get(key) is None
        assert item['id'] not in [r['id'] for r in check_list(table, key)]
        assert api('DELETE', path)[0] == 404
        print(table + ': CRUD, SQL commits, cache population/hits/TTL/invalidation/reload PASS')
    print('HTTP OpenAPI, non-root UID, and no .env files in image: PASS')
elif stage == 'seed':
    records = []
    for table, field, flag, key in resources:
        status, row = api('POST', '/' + table, {field: 'Compose persistence ' + uuid4().hex})
        assert status == 201 and row in db_rows(table)
        check_list(table, key)
        records.append({'table': table, 'row': row})
    print(json.dumps(records))
elif stage == 'persisted':
    records = json.loads(sys.argv[2])
    assert cache.dbsize() == 0, 'Redis cache should be empty after container recreation'
    for record in records:
        table, row = record['table'], record['row']
        assert row in db_rows(table), 'PostgreSQL lost persisted record'
        assert row in api('GET', '/' + table)[1], 'API failed to reload persisted record'
        assert api('DELETE', '/' + table + '/' + row['id']) == (204, None)
    print('PostgreSQL rows persisted; empty Redis cache repopulated: PASS')
else:
    raise SystemExit('Unknown stage')
cache.close()
engine.dispose()
