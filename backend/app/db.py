"""SQLite-backed cache for Semantic Scholar responses and LLM outputs.

Three tables:
  s2_cache(key, json, fetched_at)   -- raw S2 responses keyed by endpoint+id+fields
  llm_cache(signature, output, ...) -- LLM outputs keyed by a content signature
  papers(paper_id, json, ...)       -- denormalized paper records for instant lookups

A single module-level connection is used. We enable WAL + check_same_thread=False
so it is safe to touch from FastAPI's threadpool / async handlers.
"""
import json
import sqlite3
import threading
import time
from typing import Any, Optional

from . import config

_conn: Optional[sqlite3.Connection] = None
_lock = threading.Lock()


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
        _conn.execute("PRAGMA journal_mode=WAL;")
        _conn.row_factory = sqlite3.Row
    return _conn


def init_db() -> None:
    conn = get_conn()
    with _lock:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS s2_cache (
                key        TEXT PRIMARY KEY,
                json       TEXT NOT NULL,
                fetched_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS llm_cache (
                signature  TEXT PRIMARY KEY,
                output     TEXT NOT NULL,
                fetched_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS papers (
                paper_id   TEXT PRIMARY KEY,
                json       TEXT NOT NULL,
                fetched_at REAL NOT NULL
            );
            """
        )
        conn.commit()


# --- s2_cache ---------------------------------------------------------------

def s2_get(key: str) -> Optional[Any]:
    with _lock:
        row = get_conn().execute(
            "SELECT json FROM s2_cache WHERE key = ?", (key,)
        ).fetchone()
    return json.loads(row["json"]) if row else None


def s2_set(key: str, value: Any) -> None:
    conn = get_conn()
    with _lock:
        conn.execute(
            "INSERT OR REPLACE INTO s2_cache (key, json, fetched_at) VALUES (?, ?, ?)",
            (key, json.dumps(value), time.time()),
        )
        conn.commit()


# --- llm_cache --------------------------------------------------------------

def llm_get(signature: str) -> Optional[str]:
    with _lock:
        row = get_conn().execute(
            "SELECT output FROM llm_cache WHERE signature = ?", (signature,)
        ).fetchone()
    return row["output"] if row else None


def llm_set(signature: str, output: str) -> None:
    conn = get_conn()
    with _lock:
        conn.execute(
            "INSERT OR REPLACE INTO llm_cache (signature, output, fetched_at) VALUES (?, ?, ?)",
            (signature, output, time.time()),
        )
        conn.commit()


# --- papers -----------------------------------------------------------------

def papers_put_many(records: list[dict]) -> None:
    conn = get_conn()
    now = time.time()
    rows = [(r["paperId"], json.dumps(r), now) for r in records if r and r.get("paperId")]
    if not rows:
        return
    with _lock:
        conn.executemany(
            "INSERT OR REPLACE INTO papers (paper_id, json, fetched_at) VALUES (?, ?, ?)",
            rows,
        )
        conn.commit()


def paper_get(paper_id: str) -> Optional[dict]:
    with _lock:
        row = get_conn().execute(
            "SELECT json FROM papers WHERE paper_id = ?", (paper_id,)
        ).fetchone()
    return json.loads(row["json"]) if row else None
