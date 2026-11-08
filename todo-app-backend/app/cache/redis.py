import json
from redis import Redis


class RedisCacheBackend:
    def __init__(self, redis_url: str, cache_ttl_seconds: int | None = None):
        self.redis = Redis.from_url(redis_url, decode_responses=True)
        self.cache_ttl_seconds = cache_ttl_seconds

    def set(self, key: str, value: list | dict) -> None:
        self.redis.set(key, json.dumps(value), ex=self.cache_ttl_seconds)

    def get(self, key: str) -> list | dict | None:
        data = self.redis.get(key)

        if data is None:
            return None

        return json.loads(data)

    def delete(self, key: str) -> None:
        self.redis.delete(key)