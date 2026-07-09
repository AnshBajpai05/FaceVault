"""Held-out evaluation of the FaceVault retrieval pipeline.

Protocol (leak-free by construction):
  * A set of identities is held out entirely as IMPOSTORS — their faces become
    queries whose true identity is absent from the gallery. They measure the
    false-match side (does the system correctly say new_identity?).
  * For every remaining identity, N query faces are held out; the gallery is
    that identity's remaining faces. Queries NEVER retrieve themselves because
    they are not in the gallery.
  * Routing runs against gallery-only centroids; identity-scoped retrieval and
    the adaptive final filter replicate the production logic (same constants,
    imported from logic.py). Routing thresholds are overridable to study the
    genuine-FNMR vs impostor-rejection trade-off.

Runs on stored embeddings — no GPU, no torch, seconds not hours.

Usage:
  python -m pipeline.evaluate --data-dir data --out data/eval \
      --queries-per-identity 3 --impostor-identities 40 --seed 42 \
      [--min-accept 0.60 --min-gray 0.55 --min-retry 0.50 --margin-req 0.05]
"""

import argparse
import csv
import json
import os
import sys
import time
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import logic  # noqa: E402
from logic import (  # noqa: E402
    THRESH_STRONG,
    THRESH_WEAK,
    choose_threshold,
    normalize,
    route_status,
)
from pipeline.manifest import write_manifest  # noqa: E402

MAX_ITERS = 3


def load_assets(data_dir):
    import pandas as pd

    emb = np.load(os.path.join(data_dir, "face_embeddings.npy")).astype("float32")
    index_df = pd.read_csv(os.path.join(data_dir, "face_embedding_index.csv"))
    face_ids = index_df["face_id"].astype(str).tolist()
    meta = pd.read_csv(os.path.join(data_dir, "face_metadata.csv"))
    meta["face_id"] = meta["face_id"].astype(str)
    fid_to_identity = dict(zip(meta.face_id, meta.identity_id))
    identity_rows = defaultdict(list)
    for row, fid in enumerate(face_ids):
        ident = fid_to_identity.get(fid)
        if ident is not None:
            identity_rows[ident].append(row)
    return emb, identity_rows


def scoped_search(emb, gallery_rows, query_vec):
    """Recursive cluster expansion + adaptive final filter over one identity's
    gallery rows — faithful to the production algorithm."""
    gallery = emb[gallery_rows]
    centroid = normalize(query_vec)
    kept = np.zeros(len(gallery_rows), dtype=bool)
    last_count = -1

    for _ in range(MAX_ITERS):
        sims = gallery @ centroid
        strong = sims >= THRESH_STRONG
        if not strong.any():
            break
        kept |= sims >= THRESH_WEAK
        centroid = normalize(gallery[kept].mean(axis=0))
        if int(kept.sum()) == last_count:
            break
        last_count = int(kept.sum())

    if not kept.any():
        return np.zeros(len(gallery_rows), dtype=bool)

    cluster = gallery[kept]
    final_centroid = normalize(cluster.mean(axis=0))
    cmean = float((cluster @ final_centroid).mean())
    thresh = choose_threshold(cmean, "accepted")
    cos_centroid = gallery @ final_centroid
    return kept & (cos_centroid >= thresh)


def run_eval(
    data_dir="data",
    queries_per_identity=3,
    min_faces=8,
    impostor_identities=40,
    max_identities=0,
    seed=42,
    min_accept=logic.MIN_ACCEPT,
    min_gray=logic.MIN_GRAY,
    min_retry=logic.MIN_RETRY,
    margin_req=logic.MARGIN_REQ,
    _assets=None,
):
    """Run the held-out protocol; returns (summary, per_query).

    Pass _assets=(emb, identity_rows) to reuse loaded data across sweep runs.
    """
    rng = np.random.default_rng(seed)
    t0 = time.time()

    emb, identity_rows = _assets if _assets else load_assets(data_dir)
    eligible = sorted(i for i, rows in identity_rows.items() if len(rows) >= min_faces)
    rng.shuffle(eligible)

    impostors = eligible[:impostor_identities]
    genuine_ids = eligible[impostor_identities:]
    if max_identities:
        genuine_ids = genuine_ids[:max_identities]

    # ---- Split queries / gallery, build gallery-only centroids ----
    queries = []  # (query_row, true_identity, is_impostor)
    gallery_by_identity = {}
    for ident in genuine_ids:
        rows = np.array(identity_rows[ident])
        rng.shuffle(rows)
        q = rows[:queries_per_identity]
        g = rows[queries_per_identity:]
        gallery_by_identity[ident] = g
        queries += [(int(r), ident, False) for r in q]
    for ident in impostors:
        rows = np.array(identity_rows[ident])
        rng.shuffle(rows)
        for r in rows[:queries_per_identity]:
            queries.append((int(r), ident, True))

    centroid_ids = list(gallery_by_identity.keys())
    centroids = np.stack(
        [normalize(emb[gallery_by_identity[i]].mean(axis=0)) for i in centroid_ids]
    )

    # ---- Run every query through routing + scoped retrieval ----
    per_query = []
    for row, true_ident, is_imp in queries:
        q = normalize(emb[row])
        sims = centroids @ q
        order = np.argsort(-sims)
        best, second = float(sims[order[0]]), float(sims[order[1]])
        routed = centroid_ids[order[0]]
        status = route_status(
            best,
            best - second,
            min_accept=min_accept,
            min_gray=min_gray,
            min_retry=min_retry,
            margin_req=margin_req,
        )

        precision = recall = 0.0
        returned = 0
        if status != "new_identity":
            g_rows = gallery_by_identity[routed]
            mask = scoped_search(emb, g_rows, q)
            returned = int(mask.sum())
            if returned:
                correct = returned if routed == true_ident else 0
                precision = correct / returned
                if routed == true_ident:
                    recall = returned / len(g_rows)

        per_query.append(
            dict(
                true_identity=true_ident,
                routed_identity=routed,
                is_impostor=is_imp,
                status=status,
                best_sim=round(best, 4),
                margin=round(best - second, 4),
                routing_correct=(not is_imp) and routed == true_ident,
                returned=returned,
                precision=round(precision, 4),
                recall=round(recall, 4),
            )
        )

    # ---- Aggregate ----
    genuine = [r for r in per_query if not r["is_impostor"]]
    imps = [r for r in per_query if r["is_impostor"]]
    searched = [r for r in genuine if r["status"] != "new_identity"]

    def mean(xs):
        return float(np.mean(xs)) if xs else 0.0

    status_counts = defaultdict(int)
    for r in genuine:
        status_counts[r["status"]] += 1

    summary = {
        "protocol": {
            "held_out_queries": True,
            "self_match_possible": False,
            "genuine_identities": len(genuine_ids),
            "impostor_identities": len(impostors),
            "genuine_queries": len(genuine),
            "impostor_queries": len(imps),
            "seed": seed,
        },
        "thresholds": {
            "min_accept": min_accept,
            "min_gray": min_gray,
            "min_retry": min_retry,
            "margin_req": margin_req,
        },
        "routing": {
            "accuracy": mean([r["routing_correct"] for r in genuine]),
            "status_counts": dict(status_counts),
            "fnmr_new_identity_rate": mean(
                [r["status"] == "new_identity" for r in genuine]
            ),
        },
        "retrieval_over_searched_queries": {
            "mean_precision": mean([r["precision"] for r in searched]),
            "median_precision": float(np.median([r["precision"] for r in searched]))
            if searched
            else 0.0,
            "mean_recall": mean([r["recall"] for r in searched]),
            "mean_results": mean([r["returned"] for r in searched]),
        },
        "impostors": {
            "correct_rejection_rate": mean(
                [r["status"] == "new_identity" for r in imps]
            ),
            "false_accept_rate": mean([r["status"] == "accepted" for r in imps]),
            "any_results_rate": mean([r["returned"] > 0 for r in imps]),
        },
        "runtime_seconds": round(time.time() - t0, 2),
    }
    return summary, per_query


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data-dir", default="data")
    ap.add_argument("--out", default=os.path.join("data", "eval"))
    ap.add_argument("--queries-per-identity", type=int, default=3)
    ap.add_argument("--min-faces", type=int, default=8,
                    help="identities with fewer faces are skipped")
    ap.add_argument("--impostor-identities", type=int, default=40)
    ap.add_argument("--max-identities", type=int, default=0,
                    help="0 = use all eligible identities")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--min-accept", type=float, default=logic.MIN_ACCEPT)
    ap.add_argument("--min-gray", type=float, default=logic.MIN_GRAY)
    ap.add_argument("--min-retry", type=float, default=logic.MIN_RETRY)
    ap.add_argument("--margin-req", type=float, default=logic.MARGIN_REQ)
    args = ap.parse_args()

    summary, per_query = run_eval(
        data_dir=args.data_dir,
        queries_per_identity=args.queries_per_identity,
        min_faces=args.min_faces,
        impostor_identities=args.impostor_identities,
        max_identities=args.max_identities,
        seed=args.seed,
        min_accept=args.min_accept,
        min_gray=args.min_gray,
        min_retry=args.min_retry,
        margin_req=args.margin_req,
    )

    os.makedirs(args.out, exist_ok=True)
    csv_path = os.path.join(args.out, "eval_per_query.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(per_query[0].keys()))
        writer.writeheader()
        writer.writerows(per_query)
    summary_path = os.path.join(args.out, "eval_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    write_manifest(
        args.out,
        "evaluate",
        params=vars(args),
        inputs=[
            os.path.join(args.data_dir, "face_embeddings.npy"),
            os.path.join(args.data_dir, "face_embedding_index.csv"),
            os.path.join(args.data_dir, "face_metadata.csv"),
        ],
        outputs=[csv_path, summary_path],
    )

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
