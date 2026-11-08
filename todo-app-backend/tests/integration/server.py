"""Launch the unchanged app with process-local integration settings."""
import os

import uvicorn

from app.core.config import get_settings


settings = get_settings()
settings.cache_ttl_seconds = int(os.environ['INTEGRATION_CACHE_TTL'])
settings.cache_tasks_key = os.environ['INTEGRATION_CACHE_PREFIX'] + ':tasks'
settings.cache_category_key = os.environ['INTEGRATION_CACHE_PREFIX'] + ':categories'

uvicorn.run('app.main:app', host='127.0.0.1', fd=int(os.environ['INTEGRATION_SERVER_FD']))
