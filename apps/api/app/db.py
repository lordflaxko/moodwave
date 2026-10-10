"""Database engine and session dependency (SQLite by default, any SQLAlchemy URL works)."""

from collections.abc import Iterator

from sqlalchemy import inspect, text
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
    add_missing_columns()


def add_missing_columns(bind=None) -> list[str]:
    """Add columns that models gained since their table was created.

    `create_all` only creates missing tables. With no migration tool, new nullable (or
    defaulted) columns on existing tables are added here at startup. Returns what it added.
    """
    bind = bind or engine
    inspector = inspect(bind)
    added: list[str] = []
    with bind.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing or column.primary_key:
                    continue
                ddl_type = column.type.compile(dialect=bind.dialect)
                default = ""
                if column.default is not None and getattr(column.default, "is_scalar", False):
                    value = column.default.arg
                    default = f" DEFAULT {'TRUE' if value is True else 'FALSE' if value is False else repr(value)}"
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {ddl_type}{default}'))
                added.append(f"{table.name}.{column.name}")
    return added


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
