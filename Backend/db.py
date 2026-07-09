"""SQLite persistence for FaceVault runtime state.

Replaces in-memory deques and the append-only JSONL feedback file with a
transactional store that survives restarts and is safe across processes.
Embeddings stay in numpy files — SQLite holds events and logs, not vectors.
"""

import os
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone

_LOCK = threading.Lock()
_conn = None

_SCHEMA = """
CREATE TABLE IF NOT EXISTS searches (
    id           TEXT PRIMARY KEY,
    ts           TEXT NOT NULL,
    status       TEXT NOT NULL,
    strong_ratio REAL NOT NULL,
    identity     TEXT
);
CREATE INDEX IF NOT EXISTS idx_searches_ts ON searches (ts);

CREATE TABLE IF NOT EXISTS feedback (
    id             TEXT PRIMARY KEY,
    ts             TEXT NOT NULL,
    action         TEXT NOT NULL,
    face_id        TEXT NOT NULL,
    threshold_used REAL
);
CREATE INDEX IF NOT EXISTS idx_feedback_ts ON feedback (ts);

CREATE TABLE IF NOT EXISTS identity_events (
    id          TEXT PRIMARY KEY,
    ts          TEXT NOT NULL,
    action      TEXT NOT NULL,     -- 'enroll' | 'delete'
    identity_id TEXT NOT NULL,
    detail      TEXT               -- free-form JSON (faces added, note, ...)
);
CREATE INDEX IF NOT EXISTS idx_identity_events_ts ON identity_events (ts);
"""


def _now():
    return datetime.now(timezone.utc).isoformat()


def init(db_path):
    """Open (creating if needed) the database and ensure the schema exists."""
    global _conn
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    _conn = sqlite3.connect(db_path, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    with _LOCK, _conn:
        _conn.executescript(_SCHEMA)
    return _conn


def import_legacy_feedback(records):
    """One-time migration of pre-SQLite JSONL feedback records.

    Only runs when the feedback table is empty; preserves original order so
    later-overrides-earlier replay semantics are unchanged.
    """
    with _LOCK:
        count = _conn.execute("SELECT COUNT(*) FROM feedback").fetchone()[0]
        if count > 0:
            return 0
        imported = 0
        with _conn:
            for rec in records:
                fid = str(rec.get("face_id", ""))
                action = rec.get("action")
                if not fid or action not in ("promote", "reject_false_positive"):
                    continue
                _conn.execute(
                    "INSERT OR IGNORE INTO feedback (id, ts, action, face_id, threshold_used)"
                    " VALUES (?, ?, ?, ?, ?)",
                    (
                        rec.get("id") or str(uuid.uuid4()),
                        rec.get("timestamp") or _now(),
                        action,
                        fid,
                        rec.get("threshold_used"),
                    ),
                )
                imported += 1
        return imported


# ---------------- searches ----------------

def record_search(status, strong_ratio, identity):
    with _LOCK, _conn:
        _conn.execute(
            "INSERT INTO searches (id, ts, status, strong_ratio, identity) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), _now(), status, float(strong_ratio), identity),
        )


def recent_searches(limit=100):
    with _LOCK:
        rows = _conn.execute(
            "SELECT ts, status, strong_ratio, identity FROM searches ORDER BY ts DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [
        {
            "timestamp": r["ts"],
            "status": r["status"],
            "strong_ratio": r["strong_ratio"],
            "identity": r["identity"],
        }
        for r in rows
    ]


def stats(days=30):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with _LOCK:
        row = _conn.execute(
            """
            SELECT COUNT(*)                                        AS total,
                   COALESCE(AVG(strong_ratio), 0)                  AS avg_strong,
                   SUM(status IN ('ambiguous', 'gray_zone'))       AS ambiguous,
                   COUNT(DISTINCT identity)                        AS identities
            FROM searches WHERE ts >= ?
            """,
            (cutoff,),
        ).fetchone()
    total = row["total"] or 0
    return {
        "total_queries": total,
        "avg_strong_ratio": float(row["avg_strong"] or 0.0),
        "ambiguous_rate": (row["ambiguous"] or 0) / total * 100 if total else 0.0,
        "identities_seen": row["identities"] or 0,
    }


# ---------------- feedback ----------------

def record_feedback(action, face_id, threshold_used=None):
    record = {
        "id": str(uuid.uuid4()),
        "timestamp": _now(),
        "action": action,
        "face_id": str(face_id),
        "threshold_used": threshold_used,
    }
    with _LOCK, _conn:
        _conn.execute(
            "INSERT INTO feedback (id, ts, action, face_id, threshold_used) VALUES (?, ?, ?, ?, ?)",
            (record["id"], record["timestamp"], action, record["face_id"], threshold_used),
        )
    return record


def all_feedback_ordered():
    """All feedback records oldest-first, for later-overrides-earlier replay."""
    with _LOCK:
        rows = _conn.execute(
            "SELECT ts, action, face_id, threshold_used FROM feedback ORDER BY ts ASC"
        ).fetchall()
    return [
        {
            "timestamp": r["ts"],
            "action": r["action"],
            "face_id": r["face_id"],
            "threshold_used": r["threshold_used"],
        }
        for r in rows
    ]


# ---------------- identity lifecycle ----------------

def record_identity_event(action, identity_id, detail=None):
    record = {
        "id": str(uuid.uuid4()),
        "timestamp": _now(),
        "action": action,
        "identity_id": str(identity_id),
        "detail": detail,
    }
    with _LOCK, _conn:
        _conn.execute(
            "INSERT INTO identity_events (id, ts, action, identity_id, detail)"
            " VALUES (?, ?, ?, ?, ?)",
            (record["id"], record["timestamp"], action, record["identity_id"], detail),
        )
    return record


def deleted_identities():
    """Identities whose most recent lifecycle event is 'delete' (a later
    enroll revives the identity)."""
    with _LOCK:
        rows = _conn.execute(
            "SELECT identity_id, action FROM identity_events ORDER BY ts ASC"
        ).fetchall()
    state = {}
    for r in rows:
        state[r["identity_id"]] = r["action"]
    return {ident for ident, action in state.items() if action == "delete"}


def identity_events(limit=200):
    with _LOCK:
        rows = _conn.execute(
            "SELECT id, ts, action, identity_id, detail FROM identity_events"
            " ORDER BY ts DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "timestamp": r["ts"],
            "action": r["action"],
            "identity_id": r["identity_id"],
            "detail": r["detail"],
        }
        for r in rows
    ]


def search_status_counts():
    """All-time search counts by routing status (for /metrics)."""
    with _LOCK:
        rows = _conn.execute(
            "SELECT status, COUNT(*) AS n FROM searches GROUP BY status"
        ).fetchall()
    return {r["status"]: r["n"] for r in rows}


def feedback_action_counts():
    """All-time feedback counts by action (for /metrics)."""
    with _LOCK:
        rows = _conn.execute(
            "SELECT action, COUNT(*) AS n FROM feedback GROUP BY action"
        ).fetchall()
    return {r["action"]: r["n"] for r in rows}


def recent_feedback(limit=1000):
    with _LOCK:
        rows = _conn.execute(
            "SELECT id, ts, action, face_id, threshold_used FROM feedback ORDER BY ts DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "timestamp": r["ts"],
            "action": r["action"],
            "face_id": r["face_id"],
            "threshold_used": r["threshold_used"],
        }
        for r in rows
    ]
