"""Start the real Uvicorn entry point; documentation requests do not access the DB."""
import json
import socket
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


def test_uvicorn_startup_and_openapi(tmp_path):
    backend = Path(__file__).resolve().parents[1]
    with socket.socket() as listener, (tmp_path / 'uvicorn.log').open('w+') as log:
        listener.bind(('127.0.0.1', 0))
        listener.listen()
        port = listener.getsockname()[1]
        process = subprocess.Popen(
            [sys.executable, '-B', '-m', 'uvicorn', 'app.main:app',
             '--fd', str(listener.fileno()), '--lifespan', 'on'],
            cwd=backend, pass_fds=(listener.fileno(),), stdout=log, stderr=log,
        )
        try:
            deadline = time.monotonic() + 10
            while True:
                try:
                    with urlopen(f'http://127.0.0.1:{port}/openapi.json', timeout=0.5) as response:
                        schema = json.load(response)
                    break
                except (URLError, TimeoutError):
                    if process.poll() is not None or time.monotonic() > deadline:
                        log.seek(0)
                        raise AssertionError(log.read())
                    time.sleep(0.05)
            assert sum(len(methods) for methods in schema['paths'].values()) == 8
            with urlopen(f'http://127.0.0.1:{port}/docs', timeout=2) as response:
                assert response.status == 200
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        assert process.returncode in (0, -signal.SIGTERM)
        log.seek(0)
        output = log.read()
        assert 'Application startup complete' in output
        assert 'Application shutdown complete' in output
