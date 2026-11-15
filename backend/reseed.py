"""Reset local Nimbus data by replaying Alembic migrations.

Deletes inspection edits, handovers, custom users/aircraft and login sessions.
Run from backend: pipenv run python reseed.py
"""

import re
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

from alembic import command
from alembic.config import Config
from app.core.settings import get_settings


def main() -> int:
    settings = get_settings()
    if settings.POSTGRES_DB != "nimbus" or settings.POSTGRES_SERVER not in {
        "localhost", "127.0.0.1", "::1"
    }:
        print("No changes made: reseeding is limited to the local nimbus database.")
        return 1
    if any(
        not re.fullmatch(r"[0-9]{6}", pin)
        for pin in (settings.SEED_HOM_PIN, settings.SEED_PEACH_PIN)
    ):
        print("No changes made: set six-digit SEED_HOM_PIN and SEED_PEACH_PIN in .env.")
        return 1
    engine = create_engine(settings.database_url, connect_args={"connect_timeout": 3})
    try:
        # PostgreSQL transactional DDL preserves old data if any migration fails.
        with engine.begin() as connection:
            config = Config(str(Path(__file__).with_name("alembic.ini")))
            config.attributes["connection"] = connection
            command.downgrade(config, "base")
            command.upgrade(config, "head")
            counts = {
                table: connection.execute(
                    text(f"SELECT count(*) FROM {table}")
                ).scalar_one()
                for table in (
                    "users", "aircraft", "aircraft_assignments", "work_items",
                    "handoffs", "login_sessions",
                )
            }
    except OperationalError:
        print("Reseed failed: database unavailable. Transaction rolled back.")
        return 1
    finally:
        engine.dispose()
    print("Demo data restored:", counts)
    print("Refresh Nimbus and sign in again using the seed PINs from .env.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
