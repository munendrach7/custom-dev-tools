"""SQLAlchemy engine, session, and Base for the API Client backend.

Supports SQLite (local dev, default) and Microsoft SQL Server (Docker) via the
`DATABASE_URL` env var, e.g.:
    mssql+pymssql://sa:Password@db:1433/devtools
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker, declarative_base

# Persist SQLite under a data dir so it can be mounted as a Docker volume.
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
os.makedirs(DATA_DIR, exist_ok=True)

DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{os.path.join(DATA_DIR, 'devtools.db')}")
_is_sqlite = DATABASE_URL.startswith("sqlite")

# check_same_thread is only needed for SQLite.
connect_args = {"check_same_thread": False} if _is_sqlite else {}
# pool_pre_ping keeps pooled connections healthy (important for networked DBs).
engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=not _is_sqlite,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_database():
    """For SQL Server, create the target database if it doesn't exist yet.

    The SQL Server image only provisions the system databases, so we connect to
    `master` and issue CREATE DATABASE for our app database on first boot.
    """
    url = make_url(DATABASE_URL)
    if url.get_backend_name() != "mssql":
        return
    dbname = url.database
    master_url = url.set(database="master")
    tmp = create_engine(master_url, isolation_level="AUTOCOMMIT", pool_pre_ping=True)
    try:
        with tmp.connect() as conn:
            conn.exec_driver_sql(
                f"IF DB_ID(N'{dbname}') IS NULL CREATE DATABASE [{dbname}]"
            )
    finally:
        tmp.dispose()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
