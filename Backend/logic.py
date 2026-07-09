"""Pure decision logic for FaceVault, separated from models and I/O so it can
be unit-tested without torch/faiss or the dataset.

All Phase-4 thresholds live here; main.py imports them from this module.
"""

import numpy as np

# ---------------- Phase-4 routing thresholds ----------------
MIN_ACCEPT = 0.60   # routing: accept identity outright
MIN_GRAY = 0.55     # routing: ambiguous band
MIN_RETRY = 0.50    # routing: gray-zone retry floor
MARGIN_REQ = 0.05   # required gap between best and second identity

# ---------------- Retrieval thresholds ----------------
THRESH_STRONG = 0.60
THRESH_WEAK = 0.45


def normalize(v):
    """L2-normalize a vector (safe on zero vectors)."""
    v = np.asarray(v).astype("float32")
    return v / (np.linalg.norm(v) + 1e-10)


def clamp_box(img_width, img_height, x1, y1, x2, y2):
    """Clamp box corners to image bounds; None if the region is degenerate."""
    x1 = max(0, int(x1))
    y1 = max(0, int(y1))
    x2 = min(img_width, int(x2))
    y2 = min(img_height, int(y2))
    if x2 <= x1 or y2 <= y1:
        return None
    return x1, y1, x2, y2


def route_status(best_sim, margin):
    """Phase-4 identity-routing decision from centroid similarity + margin."""
    if best_sim >= MIN_ACCEPT and margin >= MARGIN_REQ:
        return "accepted"
    if best_sim >= MIN_GRAY:
        return "ambiguous"
    if best_sim >= MIN_RETRY:
        return "gray_zone"
    return "new_identity"


def choose_threshold(cmean, status):
    """Centroid-similarity filter threshold, adaptive to cluster tightness."""
    if status in ("gray_zone", "ambiguous"):
        return 0.55
    if cmean > 0.80:
        return 0.45
    if cmean > 0.70:
        return 0.48
    return 0.50


def replay_feedback(records):
    """Fold an ordered feedback stream into (rejected, promoted) face-id sets.

    Later records override earlier ones — a promote after a reject clears the
    rejection, and vice versa.
    """
    rejected, promoted = set(), set()
    for rec in records:
        fid = str(rec.get("face_id", ""))
        if not fid:
            continue
        action = rec.get("action")
        if action == "reject_false_positive":
            rejected.add(fid)
            promoted.discard(fid)
        elif action == "promote":
            promoted.add(fid)
            rejected.discard(fid)
    return rejected, promoted
