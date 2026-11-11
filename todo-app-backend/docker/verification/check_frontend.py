"""Browser smoke check for an isolated Compose stack; removes only its own records.

Run with the optional tests/integration/requirements-browser.txt dependencies:
    python docker/verification/check_frontend.py http://127.0.0.1:18000
"""
import argparse
import re
from urllib.parse import urlsplit
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright


def check_frontend(origin):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.set_default_timeout(15000)
        errors, requests, created = [], [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('requestfailed', lambda request: errors.append(request.url))
        page.on('request', lambda request: requests.append((request.method, request.url))
                if request.resource_type in ('xhr', 'fetch') else None)

        def loaded():
            for label in ('Tasks', 'Categories'):
                expect(page.get_by_role('navigation').get_by_role(
                    'button', name=re.compile(rf'^{label} \d+$'))).to_be_visible()

        def view(resource):
            loaded()
            page.get_by_role('navigation').get_by_role(
                'button', name=re.compile(resource.capitalize())).click()
            expect(page.get_by_role('button', name=f'Refresh {resource}')).to_be_enabled()

        def saved(message, resource):
            expect(page.get_by_text(message, exact=True)).to_be_visible()
            expect(page.get_by_role('button', name=f'Refresh {resource}')).to_be_enabled()
            expect(page.get_by_role('alert')).to_have_count(0)

        def stored(resource, record):
            response = page.request.get(f'{origin}/api/{resource}')
            assert response.status == 200
            assert record in response.json()

        try:
            response = page.goto(origin)
            assert response.status == 200
            for resource, kind, field, flag in [
                ('tasks', 'task', 'title', 'completed'),
                ('categories', 'category', 'name', 'complete'),
            ]:
                view(resource)
                title = f'Docker browser {kind} {uuid4().hex[:8]}'
                page.get_by_role('textbox').fill(title)
                with page.expect_response(lambda response: response.url == f'{origin}/api/{resource}'
                                          and response.request.method == 'POST') as result:
                    page.get_by_role('button', name=f'Add {kind}', exact=True).click()
                assert result.value.status == 201
                record = result.value.json()
                created.append((resource, record['id']))
                saved(f'{kind.capitalize()} created.', resource)
                assert record[field] == title and record[flag] is False
                stored(resource, record)

                page.reload()
                view(resource)
                expect(page.get_by_text(title, exact=True)).to_be_visible()
                page.get_by_role('button', name=f'Edit {kind} “{title}”').click()
                title += ' updated'
                page.get_by_role('textbox').fill(title)
                page.get_by_role('button', name='Save changes', exact=True).click()
                saved(f'{kind.capitalize()} updated.', resource)
                page.get_by_role('checkbox', name=f'Mark {kind} “{title}” as completed').click()
                saved(f'{kind.capitalize()} marked as completed.', resource)
                record.update({field: title, flag: True})
                stored(resource, record)

                page.reload()
                view(resource)
                expect(page.get_by_role('checkbox', name=f'Mark {kind} “{title}” as active')).to_be_checked()
                with page.expect_response(lambda response: response.request.method == 'DELETE'
                                          and response.url == f'{origin}/api/{resource}/{record["id"]}') as result:
                    page.get_by_role('button', name=f'Delete {kind} “{title}”').click()
                assert result.value.status == 204
                saved(f'{kind.capitalize()} deleted.', resource)
                page.reload()
                view(resource)
                expect(page.get_by_text(title, exact=True)).to_have_count(0)
                print(f'{resource}: browser CRUD, completion, and page-reload persistence PASS')

            # SPA navigation must serve HTML; unknown API paths must remain JSON errors.
            assert page.goto(origin + '/refresh-check').status == 200
            expect(page.get_by_role('heading', name='Tasks', exact=True)).to_be_visible()
            loaded()
            assert page.reload().status == 200
            loaded()
            response = page.request.get(origin + '/api/not-a-route')
            assert response.status == 404 and response.json() == {'detail': 'Not Found'}
            assert requests and all(url.startswith(origin + '/api/') for _, url in requests), requests
            assert {'GET', 'POST', 'PATCH', 'DELETE'} <= {method for method, _ in requests}
            assert not errors, errors
            print('Same-origin /api requests, SPA refresh, API 404 handling, and browser JS: PASS')
        finally:
            try:
                for resource, record_id in created:
                    response = page.request.delete(f'{origin}/api/{resource}/{record_id}')
                    assert response.status in (204, 404), response.status
            finally:
                browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url', help='Frontend origin for a dedicated verification stack')
    origin = parser.parse_args().url.rstrip('/')
    parsed = urlsplit(origin)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.path or parsed.query or parsed.fragment:
        parser.error('Supply an HTTP(S) origin without a path, query, or fragment')
    check_frontend(origin)
