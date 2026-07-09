"""Unit tests for FaceVault's pure decision logic (no torch/faiss needed)."""

import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from logic import (
    MARGIN_REQ,
    MIN_ACCEPT,
    MIN_GRAY,
    MIN_RETRY,
    choose_threshold,
    clamp_box,
    normalize,
    replay_feedback,
    route_status,
)


# ---------------------------------------------------------
# normalize
# ---------------------------------------------------------
class TestNormalize:
    def test_unit_norm(self):
        v = normalize([3.0, 4.0])
        assert np.isclose(np.linalg.norm(v), 1.0)

    def test_zero_vector_is_safe(self):
        v = normalize([0.0, 0.0, 0.0])
        assert not np.any(np.isnan(v))

    def test_direction_preserved(self):
        v = normalize([10.0, 0.0])
        assert np.allclose(v, [1.0, 0.0])


# ---------------------------------------------------------
# clamp_box
# ---------------------------------------------------------
class TestClampBox:
    def test_inside_bounds_unchanged(self):
        assert clamp_box(100, 100, 10, 20, 50, 60) == (10, 20, 50, 60)

    def test_clamps_negative_and_overflow(self):
        assert clamp_box(100, 80, -5, -10, 150, 200) == (0, 0, 100, 80)

    def test_degenerate_box_rejected(self):
        assert clamp_box(100, 100, 50, 50, 50, 60) is None
        assert clamp_box(100, 100, 60, 50, 50, 60) is None

    def test_box_fully_outside_rejected(self):
        assert clamp_box(100, 100, 150, 150, 200, 200) is None


# ---------------------------------------------------------
# route_status — Phase-4 routing decision table
# ---------------------------------------------------------
class TestRouteStatus:
    def test_accepted_needs_similarity_and_margin(self):
        assert route_status(MIN_ACCEPT, MARGIN_REQ) == "accepted"
        assert route_status(0.90, 0.20) == "accepted"

    def test_high_similarity_but_low_margin_is_ambiguous(self):
        # Two identities nearly tied — must not be silently accepted
        assert route_status(0.90, MARGIN_REQ - 0.001) == "ambiguous"

    def test_ambiguous_band(self):
        assert route_status(MIN_GRAY, 0.5) == "ambiguous"
        assert route_status(MIN_ACCEPT - 0.001, 0.5) == "ambiguous"

    def test_gray_zone_band(self):
        assert route_status(MIN_RETRY, 0.5) == "gray_zone"
        assert route_status(MIN_GRAY - 0.001, 0.5) == "gray_zone"

    def test_new_identity_below_retry_floor(self):
        assert route_status(MIN_RETRY - 0.001, 0.5) == "new_identity"
        assert route_status(0.0, 0.0) == "new_identity"


# ---------------------------------------------------------
# choose_threshold — adaptive centroid filter
# ---------------------------------------------------------
class TestChooseThreshold:
    def test_uncertain_routing_forces_strict_threshold(self):
        assert choose_threshold(0.95, "gray_zone") == 0.55
        assert choose_threshold(0.95, "ambiguous") == 0.55

    def test_tight_cluster_relaxes_threshold(self):
        assert choose_threshold(0.85, "accepted") == 0.45

    def test_medium_cluster(self):
        assert choose_threshold(0.75, "accepted") == 0.48

    def test_loose_cluster_default(self):
        assert choose_threshold(0.60, "accepted") == 0.50

    def test_ordering_stricter_when_looser_cluster(self):
        # The looser the cluster, the higher the required similarity
        tight = choose_threshold(0.85, "accepted")
        medium = choose_threshold(0.75, "accepted")
        loose = choose_threshold(0.60, "accepted")
        assert tight < medium < loose


# ---------------------------------------------------------
# replay_feedback — HITL correction folding
# ---------------------------------------------------------
class TestReplayFeedback:
    def test_empty_log(self):
        assert replay_feedback([]) == (set(), set())

    def test_basic_partition(self):
        records = [
            {"action": "reject_false_positive", "face_id": "a"},
            {"action": "promote", "face_id": "b"},
        ]
        rejected, promoted = replay_feedback(records)
        assert rejected == {"a"}
        assert promoted == {"b"}

    def test_later_record_overrides_earlier(self):
        records = [
            {"action": "reject_false_positive", "face_id": "a"},
            {"action": "promote", "face_id": "a"},
        ]
        rejected, promoted = replay_feedback(records)
        assert rejected == set()
        assert promoted == {"a"}

    def test_reject_after_promote(self):
        records = [
            {"action": "promote", "face_id": "a"},
            {"action": "reject_false_positive", "face_id": "a"},
        ]
        rejected, promoted = replay_feedback(records)
        assert rejected == {"a"}
        assert promoted == set()

    def test_ignores_missing_face_id_and_unknown_actions(self):
        records = [
            {"action": "promote"},
            {"action": "delete_everything", "face_id": "x"},
            {"face_id": "y"},
        ]
        assert replay_feedback(records) == (set(), set())

    def test_face_ids_coerced_to_str(self):
        rejected, _ = replay_feedback(
            [{"action": "reject_false_positive", "face_id": 123}]
        )
        assert rejected == {"123"}


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
