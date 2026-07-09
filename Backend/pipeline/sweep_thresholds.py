"""Sweep routing thresholds to map the genuine-FNMR vs impostor-rejection
trade-off, using the held-out evaluation protocol.

Usage:
  python -m pipeline.sweep_thresholds --data-dir data --out data/eval
"""

import argparse
import csv
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from pipeline.evaluate import load_assets, run_eval  # noqa: E402

# (min_accept, min_gray, min_retry, margin_req)
GRID = [
    (0.60, 0.55, 0.50, 0.05),  # production defaults (baseline)
    (0.60, 0.55, 0.53, 0.05),
    (0.60, 0.56, 0.55, 0.05),
    (0.62, 0.58, 0.56, 0.05),
    (0.62, 0.58, 0.56, 0.08),
    (0.65, 0.60, 0.58, 0.08),
    (0.65, 0.62, 0.60, 0.10),
]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data-dir", default="data")
    ap.add_argument("--out", default=os.path.join("data", "eval"))
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    assets = load_assets(args.data_dir)
    rows = []
    for min_accept, min_gray, min_retry, margin_req in GRID:
        summary, _ = run_eval(
            data_dir=args.data_dir,
            seed=args.seed,
            min_accept=min_accept,
            min_gray=min_gray,
            min_retry=min_retry,
            margin_req=margin_req,
            _assets=assets,
        )
        rows.append(
            dict(
                min_accept=min_accept,
                min_gray=min_gray,
                min_retry=min_retry,
                margin_req=margin_req,
                genuine_fnmr=round(summary["routing"]["fnmr_new_identity_rate"], 4),
                routing_accuracy=round(summary["routing"]["accuracy"], 4),
                mean_precision=round(
                    summary["retrieval_over_searched_queries"]["mean_precision"], 4
                ),
                mean_recall=round(
                    summary["retrieval_over_searched_queries"]["mean_recall"], 4
                ),
                impostor_rejection=round(
                    summary["impostors"]["correct_rejection_rate"], 4
                ),
                impostor_false_accept=round(
                    summary["impostors"]["false_accept_rate"], 4
                ),
            )
        )
        print(json.dumps(rows[-1]))

    os.makedirs(args.out, exist_ok=True)
    out_csv = os.path.join(args.out, "threshold_sweep.csv")
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print(f"\nWrote {out_csv}")


if __name__ == "__main__":
    main()
