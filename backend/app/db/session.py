from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.settings import get_settings


@lru_cache
def build_engine():
    return create_engine(get_settings().database_url, pool_pre_ping=True)


def get_db():
    with Session(build_engine()) as session:
        yield session
