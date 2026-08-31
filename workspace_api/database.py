"""SQLAlchemy engine, session, and schema lifecycle.

Use one short-lived Session per API request. ``create_schema`` exists for local
development and tests; production should set ``auto_create_schema=false`` and
use migrations.

Example::

    settings = WorkspaceSettings(environment="test", database_url="sqlite://")
    database = Database(settings)
    database.create_schema()
    with database.session() as session:
        ...
"""

from __future__ import annotations

from collections.abc import Generator, Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from workspace_api.config import WorkspaceSettings


class Base(DeclarativeBase):
    """Declarative base shared by all workspace database models."""


class Database:
    """Own the SQLAlchemy engine and request-scoped session factory."""

    def __init__(self, settings: WorkspaceSettings):
        self.settings = settings
        connect_args = (
            {"check_same_thread": False}
            if settings.database_url.startswith("sqlite")
            else {}
        )
        self.engine: Engine = create_engine(
            settings.database_url,
            echo=settings.database_echo,
            pool_pre_ping=True,
            connect_args=connect_args,
        )
        if settings.database_url.startswith("sqlite"):
            event.listen(self.engine, "connect", self._enable_sqlite_foreign_keys)
        self.session_factory = sessionmaker(
            bind=self.engine,
            class_=Session,
            expire_on_commit=False,
            autoflush=False,
        )

    @staticmethod
    def _enable_sqlite_foreign_keys(connection, _record) -> None:
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    def create_schema(self) -> None:
        """Create registered tables for development or test environments."""

        import workspace_api.models  # noqa: F401

        Base.metadata.create_all(self.engine)

    @contextmanager
    def session(self) -> Iterator[Session]:
        """Provide a transaction that commits or rolls back atomically."""

        session = self.session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def dependency(self) -> Generator[Session, None, None]:
        """FastAPI dependency yielding one transaction-scoped Session."""

        with self.session() as session:
            yield session

    def dispose(self) -> None:
        """Release pooled database connections."""

        self.engine.dispose()
