"""Tests for the SQLite persistence layer (uses a temp database per test)."""

import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import db
from logic import replay_feedback


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
    db.init(str(tmp_path / "test.db"))
    yield


class TestSearches:
    def test_record_and_recent(self):
        db.record_search("accepted", 0.9, "n000081")
        db.record_search("gray_zone", 0.2, "n000002")

        recent = db.recent_searches()
        assert len(recent) == 2
        # newest first
        assert recent[0]["status"] == "gray_zone"
        assert recent[1]["identity"] == "n000081"
        assert recent[1]["strong_ratio"] == pytest.approx(0.9)

    def test_recent_respects_limit(self):
        for _ in range(5):
            db.record_search("accepted", 1.0, "x")
        assert len(db.recent_searches(limit=3)) == 3

    def test_stats_aggregation(self):
        db.record_search("accepted", 0.8, "a")
        db.record_search("ambiguous", 0.4, "b")
        db.record_search("gray_zone", 0.2, "a")

        s = db.stats(days=30)
        assert s["total_queries"] == 3
        assert s["avg_strong_ratio"] == pytest.approx((0.8 + 0.4 + 0.2) / 3)
        assert s["ambiguous_rate"] == pytest.approx(200 / 3)
        assert s["identities_seen"] == 2

    def test_stats_empty(self):
        s = db.stats()
        assert s["total_queries"] == 0
        assert s["avg_strong_ratio"] == 0.0
        assert s["ambiguous_rate"] == 0.0


class TestFeedback:
    def test_record_and_replay_order(self):
        db.record_feedback("reject_false_positive", "f1", 0.48)
        db.record_feedback("promote", "f2")
        db.record_feedback("promote", "f1")  # later record overrides rejection

        rejected, promoted = replay_feedback(db.all_feedback_ordered())
        assert rejected == set()
        assert promoted == {"f1", "f2"}

    def test_recent_feedback_newest_first(self):
        db.record_feedback("promote", "a")
        db.record_feedback("reject_false_positive", "b")
        recent = db.recent_feedback()
        assert recent[0]["face_id"] == "b"
        assert recent[0]["threshold_used"] is None

    def test_legacy_import_only_into_empty_table(self):
        legacy = [
            {"action": "reject_false_positive", "face_id": "old1", "timestamp": "2026-01-01T00:00:00+00:00"},
            {"action": "promote", "face_id": "old2"},
            {"action": "bogus", "face_id": "skipme"},
            {"action": "promote"},  # no face_id — skipped
        ]
        assert db.import_legacy_feedback(legacy) == 2

        rejected, promoted = replay_feedback(db.all_feedback_ordered())
        assert rejected == {"old1"}
        assert promoted == {"old2"}

        # second import is a no-op — table not empty anymore
        assert db.import_legacy_feedback(legacy) == 0


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
