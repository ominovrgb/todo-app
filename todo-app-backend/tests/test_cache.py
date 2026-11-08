"""Test the real JSON adapter; mock only the Redis transport boundary."""
import json

import pytest
from redis import Redis

from app.cache.redis import RedisCacheBackend


@pytest.mark.parametrize('value,ttl', [
    ([{'name': 'Кава "quoted"\n', 'complete': False, 'extra': None}], 47),
    ({'nested': {'items': [1, True, None, '☕']}}, None),
    ([], 47),
    ({}, None),
])
def test_json_round_trip_ttl_and_key_scoped_delete(redis_stub, value, ttl):
    cache = RedisCacheBackend('redis://127.0.0.1:0/0', ttl)
    Redis.from_url.assert_called_once_with('redis://127.0.0.1:0/0', decode_responses=True)
    assert cache.get('missing') is None

    cache.set('target', value)
    raw = redis_stub.get('target')
    assert isinstance(raw, str)
    assert json.loads(raw) == value
    assert redis_stub.set.call_args.kwargs == {'ex': ttl}
    decoded = cache.get('target')
    assert type(decoded) is type(value)
    assert decoded == value
    assert decoded is not value

    cache.set('other', {'keep': True})
    cache.delete('target')
    assert cache.get('target') is None
    assert cache.get('other') == {'keep': True}
    cache.delete('target')  # Redis deletion is idempotent.
