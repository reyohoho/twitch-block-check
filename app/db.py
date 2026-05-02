"""SQLite storage for Twitch block-check reports."""
from __future__ import annotations

import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

DB_PATH = Path(os.environ.get("DB_PATH", "/data/probe.sqlite3")).resolve()

_LOCK = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS reports (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           TEXT    NOT NULL,
    ip_hash      TEXT    NOT NULL,
    country      TEXT,
    region       TEXT,
    city         TEXT,
    org          TEXT,
    lat          REAL,
    lon          REAL,
    timezone     TEXT,
    manual_geo   INTEGER NOT NULL DEFAULT 0,
    timeout_ms   INTEGER,
    ua           TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_ts         ON reports(ts);
CREATE INDEX IF NOT EXISTS idx_reports_region     ON reports(region);
CREATE INDEX IF NOT EXISTS idx_reports_city       ON reports(city);
CREATE INDEX IF NOT EXISTS idx_reports_country    ON reports(country);

CREATE TABLE IF NOT EXISTS results (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id    INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    domain       TEXT    NOT NULL,
    category     TEXT,                 -- 'ru' | 'intl'
    twitch_cat   TEXT,                 -- 'main' | 'api' | 'chat_ws' | 'streaming' | 'cdn' | 'ref' | ...
    proto        TEXT,                 -- 'https' | 'wss'
    asn          TEXT,
    status       TEXT    NOT NULL,     -- 'ok' | 'blocked' | 'timeout' | 'client'
    ms           INTEGER,
    tags         TEXT                  -- JSON array, e.g. '["live-streams","clips"]'
);

CREATE INDEX IF NOT EXISTS idx_results_report_id  ON results(report_id);
CREATE INDEX IF NOT EXISTS idx_results_domain     ON results(domain);
CREATE INDEX IF NOT EXISTS idx_results_status     ON results(status);
CREATE INDEX IF NOT EXISTS idx_results_twitch_cat ON results(twitch_cat);
"""

_MIGRATIONS = [
    # 001 — add tags column (idempotent via ALTER TABLE … IF NOT EXISTS not available in old SQLite;
    #        we catch OperationalError instead)
    "ALTER TABLE results ADD COLUMN tags TEXT",
]


def init() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.executescript(SCHEMA)
        for sql in _MIGRATIONS:
            try:
                conn.execute(sql)
            except Exception:
                pass  # column already exists
        conn.commit()


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        yield conn
    finally:
        conn.close()


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    """Public connection context manager with a global write lock.

    SQLite allows multiple readers but only one writer. We serialise writers
    with a process-wide lock; readers still go via the same context but
    contention is low in practice.
    """
    with _LOCK:
        with _connect() as conn:
            yield conn
