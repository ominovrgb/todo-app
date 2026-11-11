"""One opt-in real-browser journey; all data belongs to the integration fixtures."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import subprocess
from threading import Thread
from types import SimpleNamespace

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
import pytest


# Separate selection keeps Chromium optional for ordinary integration runs.
pytestmark = pytest.mark.browser
FRONTEND = Path(__file__).resolve().parents[3] / 'todo-app-frontend'


@pytest.fixture
def browser_app(tmp_path, monkeypatch, request):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        pytest.fail('Install tests/integration/requirements-browser.txt and run python -m playwright install chromium')

    build = tmp_path / 'frontend-build'

    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    with ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(build))) as server:
        origin = f'http://127.0.0.1:{server.server_port}'
        # Apply this test's origin before the existing API fixture starts Uvicorn.
        monkeypatch.setenv('CORS_ALLOWED_ORIGINS', json.dumps([origin]))
        api = request.getfixturevalue('api')
        env = dict(os.environ, CI='true', BUILD_PATH=str(build), REACT_APP_API_BASE_URL=api.base_url)
        result = subprocess.run(['npm', 'run', 'build'], cwd=FRONTEND, env=env,
                                capture_output=True, text=True, timeout=180)
        assert result.returncode == 0, result.stdout + result.stderr
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                try:
                    page = browser.new_page()
                    page.set_default_timeout(10000)
                    yield SimpleNamespace(page=page, api=api, origin=origin)
                finally:
                    browser.close()
        finally:
            server.shutdown()
            thread.join(timeout=5)


def test_user_workflows_persist_and_recover_from_failures(browser_app, infrastructure):
    from playwright.sync_api import expect

    page, api = browser_app.page, browser_app.api
    page_errors = []
    page.on('pageerror', lambda error: page_errors.append(str(error)))

    def view(resource):
        page.get_by_role('navigation').get_by_role('button', name=re.compile(resource.capitalize())).click()
        expect(page.get_by_role('button', name=f'Refresh {resource}')).to_be_enabled()

    def saved(message, resource):
        expect(page.get_by_text(message, exact=True)).to_be_visible()
        expect(page.get_by_role('button', name=f'Refresh {resource}')).to_be_enabled()
        expect(page.get_by_role('textbox')).to_be_editable()
        expect(page.get_by_role('alert')).to_have_count(0)

    def matches_storage(resource, expected):
        assert api.request('GET', '/' + resource) == (200, expected)
        # Independent SQL connection proves the browser-visible changes committed.
        with psycopg.connect(**infrastructure.pg, row_factory=dict_row) as connection:
            rows = connection.execute(sql.SQL('SELECT * FROM {}').format(sql.Identifier(resource))).fetchall()
        assert rows == expected

    page.goto(browser_app.origin)
    expected_records = {}
    for resource, kind, field, flag, empty in [
        ('tasks', 'task', 'title', 'completed', 'A little space to get things done'),
        ('categories', 'category', 'name', 'complete', 'Give your categories a home'),
    ]:
        view(resource)
        expect(page.get_by_role('heading', name=empty)).to_be_visible()
        input_box = page.get_by_role('textbox')
        input_box.fill('   ')
        input_box.press('Enter')
        expect(page.get_by_role('button', name=f'Add {kind}', exact=True)).to_be_disabled()
        matches_storage(resource, [])
        assert api.request('POST', '/' + resource, {field: '   '})[0] == 422

        title = f'Smoke {kind} ☕'
        input_box.fill(title)
        input_box.press('Enter')
        saved(f'{kind.capitalize()} created.', resource)
        status, rows = api.request('GET', '/' + resource)
        assert status == 200 and len(rows) == 1
        expected = {'id': rows[0]['id'], field: title, flag: False}
        matches_storage(resource, [expected])

        page.reload()
        view(resource)
        expect(page.get_by_text(title, exact=True)).to_be_visible()
        page.get_by_role('button', name=f'Edit {kind} “{title}”').click()
        title = f'Updated {kind} ☕'
        input_box.fill(title)
        page.get_by_role('button', name='Save changes').click()
        saved(f'{kind.capitalize()} updated.', resource)
        # This controlled checkbox changes only after the API write and refetch.
        page.get_by_role('checkbox', name=f'Mark {kind} “{title}” as completed').click()
        saved(f'{kind.capitalize()} marked as completed.', resource)
        expected.update({field: title, flag: True})
        matches_storage(resource, [expected])
        assert api.request('PATCH', f'/{resource}/{expected["id"]}', {field: ''})[0] == 422
        matches_storage(resource, [expected])

        page.reload()
        view(resource)
        expect(page.get_by_role('checkbox', name=f'Mark {kind} “{title}” as active')).to_be_checked()
        expected_records[resource] = expected

    # A real failed PostgreSQL commit must not clear the draft or claim success.
    view('tasks')
    task = expected_records['tasks']
    page.get_by_role('button', name=f'Edit task “{task["title"]}”').click()
    page.get_by_role('textbox').fill('Retry this edit')
    with psycopg.connect(**infrastructure.pg) as connection:
        connection.execute('''
            CREATE FUNCTION reject_browser_write() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'browser test commit rejected' USING ERRCODE = '23514'; END;
            $$;
            CREATE CONSTRAINT TRIGGER reject_browser_write AFTER UPDATE ON tasks
            DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_browser_write();
        ''')
    try:
        # Unhandled cross-origin 500s can surface as network errors in Chromium.
        # Assert the user's failure/recovery contract, not a response event.
        page.get_by_role('button', name='Save changes').click()
        expect(page.get_by_role('alert')).to_be_visible()
        expect(page.get_by_text('Task updated.', exact=True)).to_have_count(0)
        expect(page.get_by_role('textbox')).to_have_value('Retry this edit')
        expect(page.get_by_role('button', name=f'Edit task “{task["title"]}”')).to_be_visible()
        matches_storage('tasks', [task])
    finally:
        with psycopg.connect(**infrastructure.pg) as connection:
            connection.execute('DROP TRIGGER reject_browser_write ON tasks')
    page.get_by_role('button', name='Save changes').click()
    saved('Task updated.', 'tasks')
    task['title'] = 'Retry this edit'
    matches_storage('tasks', [task])

    # Simulate a transport failure only for list requests; successful CRUD is real.
    page.route(api.base_url + '/tasks', lambda route: route.abort())
    page.get_by_role('button', name='Refresh tasks').click()
    expect(page.get_by_role('alert')).to_contain_text('last loaded data')
    expect(page.get_by_text(task['title'], exact=True)).to_be_visible()
    page.reload()
    expect(page.get_by_role('alert')).to_contain_text('Could not load tasks.')
    expect(page.get_by_role('heading', name='A little space to get things done')).to_have_count(0)
    expect(page.get_by_role('button', name='Categories 1', exact=True)).to_be_visible()
    page.unroute(api.base_url + '/tasks')
    page.get_by_role('button', name='Retry', exact=True).click()
    expect(page.get_by_text(task['title'], exact=True)).to_be_visible()
    expect(page.get_by_role('alert')).to_have_count(0)

    for resource, kind, field in [('categories', 'category', 'name'), ('tasks', 'task', 'title')]:
        view(resource)
        record = expected_records[resource]
        page.get_by_role('button', name=f'Delete {kind} “{record[field]}”').click()
        saved(f'{kind.capitalize()} deleted.', resource)
        matches_storage(resource, [])
        page.reload()
        view(resource)
        expect(page.get_by_role('listitem')).to_have_count(0)

    # Another client removes a record while it is being edited in this page.
    status, gone = api.request('POST', '/tasks', {'title': 'Deleted elsewhere'})
    assert status == 201
    page.get_by_role('button', name='Refresh tasks').click()
    page.get_by_role('button', name='Edit task “Deleted elsewhere”').click()
    page.get_by_role('textbox').fill('Keep my unsaved edit')
    assert api.request('DELETE', '/tasks/' + gone['id'])[0] == 204
    page.get_by_role('button', name='Save changes').click()
    expect(page.get_by_role('alert')).to_have_text(re.compile('Task not found'))
    expect(page.get_by_text('Task updated.', exact=True)).to_have_count(0)
    expect(page.get_by_role('textbox')).to_have_value('Keep my unsaved edit')
    page.get_by_role('button', name='Cancel', exact=True).click()
    page.get_by_role('button', name='Refresh tasks').click()
    expect(page.get_by_role('heading', name='A little space to get things done')).to_be_visible()
    matches_storage('tasks', [])
    assert not page_errors, page_errors
