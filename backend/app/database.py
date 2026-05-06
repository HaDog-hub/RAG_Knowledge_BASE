from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

engine = create_engine(
    settings.sqlite_url,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def _migrate() -> None:
    """Apply incremental schema changes that SQLAlchemy create_all won't handle."""
    with engine.connect() as conn:
        # v0.3: add email column to users
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN email TEXT"))
            conn.commit()
        except Exception:
            pass  # column already exists


def init_db() -> None:
    """Create all tables and run migrations. Called once on application startup."""
    from app.models import user, folder_share, document_summary, folder_settings, conversation  # noqa: F401 — register models with Base
    Base.metadata.create_all(bind=engine)
    _migrate()


def get_db():
    """FastAPI dependency: yields a DB session and ensures it is closed after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
