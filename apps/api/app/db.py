"""Database engine and session dependency (SQLite by default, any SQLAlchemy URL works)."""

from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import get_settings

_settings = get_settings()
_url = _settings.sqlalchemy_url
_connect_args = {"check_same_thread": False} if _url.startswith("sqlite") else {}
# pool_pre_ping: hosted Postgres drops idle connections while a free instance sleeps.
engine = create_engine(_url, connect_args=_connect_args, pool_pre_ping=True)


def init_db() -> None:
    # Import models so their tables are registered on SQLModel.metadata.
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
