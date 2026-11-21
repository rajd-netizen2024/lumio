import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, text, URL, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# Search for .env in backend/ or root LUMIO/ directory
backend_dir = Path(__file__).resolve().parent.parent       # .../backend
root_dir = Path(__file__).resolve().parent.parent.parent  # .../LUMIO

load_dotenv(backend_dir / ".env")
load_dotenv(root_dir / ".env")
load_dotenv()

# Option A: Check for full DB_URL or DATABASE_URL
raw_url = os.getenv("DB_URL") or os.getenv("DATABASE_URL")

if raw_url:
    # Aiven gives postgres://, SQLAlchemy requires postgresql://
    if raw_url.startswith("postgres://"):
        raw_url = raw_url.replace("postgres://", "postgresql://", 1)
    db_target = raw_url

# Option B: Build from separate DB_HOST, DB_USER, DB_PASSWORD, etc.
elif os.getenv("DB_HOST"):
    query_params = {}
    if os.getenv("DB_SSLMODE"):
        query_params["sslmode"] = os.getenv("DB_SSLMODE")
    else:
        query_params["sslmode"] = "require"

    if os.getenv("DB_SSLROOTCERT"):
        query_params["sslrootcert"] = os.getenv("DB_SSLROOTCERT")

    db_target = URL.create(
        drivername="postgresql+psycopg2",
        username=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", 5432)),
        database=os.getenv("DB_NAME", "defaultdb"),
        query=query_params,
    )
else:
    raise ValueError(
        "[ERROR] Database credentials not found in .env! "
        "Ensure either DB_URL or (DB_HOST, DB_USER, DB_PASSWORD) are defined."
    )

# Create engine for Aiven PostgreSQL
# Without timeouts, an unreachable or half-dead connection makes psycopg2 wait for the OS
# TCP timeout (many minutes), so every request just "loads forever". These make it fail fast.
# (No `options=-c ...` here: Aiven's connection pooler rejects startup options.)
engine = create_engine(
    db_target,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=5,
    max_overflow=5,
    pool_timeout=10,          # wait max 10s for a free pooled connection
    connect_args={
        "connect_timeout": 10,        # give up connecting after 10s
        "keepalives": 1,              # detect dead TCP connections
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 3,
        "tcp_user_timeout": 15000,    # ms; abort if sent data isn't acknowledged
    },
)

# Per-connection safety nets (plain SET commands, so they also work through Aiven's pooler):
# a query stuck behind someone else's lock now errors after 10s instead of hanging forever,
# and the error (with the culprit query) shows up in the uvicorn terminal.
@event.listens_for(engine, "connect")
def _set_session_timeouts(dbapi_conn, _record):
    cur = dbapi_conn.cursor()
    cur.execute("SET lock_timeout = '10s'")
    cur.execute("SET statement_timeout = '30s'")
    cur.close()
    dbapi_conn.commit()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_connection():
    try:
        print("Connecting to Aiven PostgreSQL (10s timeout)...")
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            print("Successfully connected to Aiven PostgreSQL!")
    except Exception as e:
        print(f"Error connecting to Aiven PostgreSQL: {e}")