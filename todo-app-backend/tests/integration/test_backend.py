"""Observable contracts across HTTP, PostgreSQL transactions, and real Redis."""
import json
import time
from types import SimpleNamespace

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
import pytest


pytestmark = pytest.mark.integration


@pytest.fixture(params=[('tasks', 'title', 'completed'), ('categories', 'name', 'complete')], ids=['tasks', 'categories'])
def resource(request, infrastructure):
    table, text, flag = request.param
    return SimpleNamespace(table=table, path='/' + table, text=text, flag=flag, key=infrastructure.prefix + ':' + table)


def stored(infrastructure, resource):
    # Each check opens a separate connection and can only see committed data.
    with psycopg.connect(**infrastructure.pg, row_factory=dict_row) as connection:
        return connection.execute(sql.SQL('SELECT id, {}, {} FROM {} ORDER BY id').format(
            sql.Identifier(resource.text), sql.Identifier(resource.flag), sql.Identifier(resource.table),
        )).fetchall()


def assert_list_matches_storage(api, infrastructure, resource):
    status, rows = api.request('GET', resource.path)
    assert status == 200, rows
    expected = stored(infrastructure, resource)
    assert sorted(rows, key=lambda row: row['id']) == expected
    raw = infrastructure.cache.get(resource.key)
    assert raw is not None, (
        f'Missing cache entry {resource.key}; current test keys: '
        f'{list(infrastructure.cache.scan_iter(match=infrastructure.prefix + ":*"))}'
    )
    cached = json.loads(raw)
    assert sorted(cached, key=lambda row: row['id']) == expected
    return rows


def assert_cached_read_without_database(api, infrastructure, resource, expected):
    # A SELECT would block behind this lock and hit the server's statement timeout.
    # A successful response proves the real cache supplied the result, even for [].
    with psycopg.connect(**infrastructure.pg) as blocker:
        blocker.execute(sql.SQL('LOCK TABLE {} IN ACCESS EXCLUSIVE MODE').format(sql.Identifier(resource.table)))
        assert api.request('GET', resource.path) == (200, expected)


def test_crud_persistence_and_cache_consistency(api, infrastructure, resource):
    assert infrastructure.cache.get(resource.key) is None
    assert assert_list_matches_storage(api, infrastructure, resource) == []
    assert_cached_read_without_database(api, infrastructure, resource, [])

    status, created = api.request('POST', resource.path, {resource.text: 'Кава "quoted"\n☕'})
    assert status == 201, created
    assert created == {'id': created['id'], resource.text: 'Кава "quoted"\n☕', resource.flag: False}
    assert stored(infrastructure, resource) == [created]
    assert infrastructure.cache.get(resource.key) is None
    assert assert_list_matches_storage(api, infrastructure, resource) == [created]
    assert_cached_read_without_database(api, infrastructure, resource, [created])

    status, other = api.request('POST', resource.path, {resource.text: 'Keep'})
    assert status == 201, other
    assert infrastructure.cache.get(resource.key) is None
    assert_list_matches_storage(api, infrastructure, resource)

    path = f'{resource.path}/{created["id"]}'
    for flag in (True, False):
        expected = {**created, resource.text: 'Renamed', resource.flag: flag}
        assert api.request('PATCH', path, {resource.text: 'Renamed', resource.flag: flag}) == (200, expected)
        assert infrastructure.cache.get(resource.key) is None
        rows = assert_list_matches_storage(api, infrastructure, resource)
        assert sorted(rows, key=lambda row: row['id']) == sorted([expected, other], key=lambda row: row['id'])

    assert api.request('DELETE', path) == (204, '')
    assert infrastructure.cache.get(resource.key) is None
    assert assert_list_matches_storage(api, infrastructure, resource) == [other]
    assert api.request('DELETE', path)[0] == 404
    assert api.request('DELETE', f'{resource.path}/{other["id"]}') == (204, '')
    assert infrastructure.cache.get(resource.key) is None
    assert assert_list_matches_storage(api, infrastructure, resource) == []


@pytest.mark.parametrize('operation', ['INSERT', 'UPDATE', 'DELETE'], ids=['create', 'update', 'delete'])
def test_failed_commit_preserves_database_and_cache(api, infrastructure, resource, operation):
    status, original = api.request('POST', resource.path, {resource.text: 'Original'})
    assert status == 201, original
    assert assert_list_matches_storage(api, infrastructure, resource) == [original]
    cached_before = infrastructure.cache.get(resource.key)

    # A deferred PostgreSQL trigger fails at COMMIT, not at request validation.
    with psycopg.connect(**infrastructure.pg) as connection:
        connection.execute('''
            CREATE FUNCTION reject_test_write() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION 'integration commit rejected' USING ERRCODE = '23514';
            END;
            $$
        ''')
        connection.execute(sql.SQL('''
            CREATE CONSTRAINT TRIGGER reject_test_write
            AFTER {} ON {} DEFERRABLE INITIALLY DEFERRED
            FOR EACH ROW EXECUTE FUNCTION reject_test_write()
        ''').format(sql.SQL(operation), sql.Identifier(resource.table)))

    def write():
        if operation == 'INSERT':
            return api.request('POST', resource.path, {resource.text: 'New'})
        path = f'{resource.path}/{original["id"]}'
        if operation == 'UPDATE':
            return api.request('PATCH', path, {resource.text: 'New', resource.flag: True})
        return api.request('DELETE', path)

    assert write()[0] == 500
    assert stored(infrastructure, resource) == [original]
    assert infrastructure.cache.get(resource.key) == cached_before
    assert api.request('GET', resource.path) == (200, [original])

    with psycopg.connect(**infrastructure.pg) as connection:
        connection.execute(sql.SQL('DROP TRIGGER reject_test_write ON {}').format(sql.Identifier(resource.table)))

    status, result = write()
    assert status == {'INSERT': 201, 'UPDATE': 200, 'DELETE': 204}[operation], result
    assert infrastructure.cache.get(resource.key) is None
    expected = [] if operation == 'DELETE' else [result] if operation == 'UPDATE' else [original, result]
    assert sorted(assert_list_matches_storage(api, infrastructure, resource), key=lambda row: row['id']) == sorted(expected, key=lambda row: row['id'])


@pytest.mark.parametrize('cache_ttl', [2])
def test_real_ttl_expiration_reloads_postgres(api, infrastructure, resource, cache_ttl):
    status, created = api.request('POST', resource.path, {resource.text: 'Before expiry'})
    assert status == 201, created
    assert assert_list_matches_storage(api, infrastructure, resource) == [created]
    assert 0 < infrastructure.cache.pttl(resource.key) <= cache_ttl * 1000

    # An out-of-band DB change makes a stale cache distinguishable from a reload.
    # No API read is made until Redis itself expires the old entry.
    with psycopg.connect(**infrastructure.pg) as connection:
        connection.execute(sql.SQL('UPDATE {} SET {} = %s WHERE id = %s').format(
            sql.Identifier(resource.table), sql.Identifier(resource.text),
        ), ('After expiry', created['id']))

    deadline = time.monotonic() + cache_ttl + 5
    while infrastructure.cache.exists(resource.key):
        assert time.monotonic() < deadline, 'Redis did not expire the cache entry'
        time.sleep(0.05)
    assert infrastructure.cache.pttl(resource.key) == -2
    assert assert_list_matches_storage(api, infrastructure, resource) == [{**created, resource.text: 'After expiry'}]
    assert 0 < infrastructure.cache.pttl(resource.key) <= cache_ttl * 1000
