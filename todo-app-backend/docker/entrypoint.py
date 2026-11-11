"""Build a properly escaped URL for the isolated Compose PostgreSQL service."""
import os
import sys

from sqlalchemy.engine import URL


def main():
    password = os.environ["POSTGRES_PASSWORD"]
    if not password:
        raise SystemExit("POSTGRES_PASSWORD must not be empty")
    # Do not accept a development DATABASE_URL or external database host here.
    os.environ["DATABASE_URL"] = URL.create(
        "postgresql+psycopg",
        username=os.environ["POSTGRES_USER"],
        password=password,
        host="postgres",
        port=5432,
        database=os.environ["POSTGRES_DB"],
    ).render_as_string(hide_password=False)
    os.execvp(sys.argv[1], sys.argv[1:])


if __name__ == "__main__":
    main()
