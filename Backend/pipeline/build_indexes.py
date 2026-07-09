"""Phase-3/4: build identity-centroid artifacts from embeddings.

Inputs:   <workdir>/face_embeddings.npy, face_embedding_index.csv, face_metadata.csv
Outputs:  <workdir>/identity_centroids.npy, identity_ids.pkl, identity_faiss.index

Usage:
  python -m pipeline.build_indexes --workdir data/pipeline_out
"""

import argparse
import os
import pickle
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from logic import normalize  # noqa: E402
from pipeline.manifest import write_manifest  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--workdir", required=True)
    args = ap.parse_args()

    import faiss

    emb_path = os.path.join(args.workdir, "face_embeddings.npy")
    idx_path = os.path.join(args.workdir, "face_embedding_index.csv")
    meta_path = os.path.join(args.workdir, "face_metadata.csv")

    emb = np.load(emb_path).astype("float32")
    face_ids = pd.read_csv(idx_path)["face_id"].astype(str).tolist()
    meta = pd.read_csv(meta_path)
    meta["face_id"] = meta["face_id"].astype(str)
    fid_to_identity = dict(zip(meta.face_id, meta.identity_id))

    rows_by_identity = {}
    for row, fid in enumerate(face_ids):
        ident = fid_to_identity.get(fid)
        if ident is not None:
            rows_by_identity.setdefault(ident, []).append(row)

    identity_ids = sorted(rows_by_identity)
    centroids = np.stack(
        [normalize(emb[rows_by_identity[i]].mean(axis=0)) for i in identity_ids]
    ).astype("float32")

    index = faiss.IndexFlatIP(centroids.shape[1])
    index.add(centroids)

    cent_path = os.path.join(args.workdir, "identity_centroids.npy")
    ids_path = os.path.join(args.workdir, "identity_ids.pkl")
    faiss_path = os.path.join(args.workdir, "identity_faiss.index")

    np.save(cent_path, centroids)
    with open(ids_path, "wb") as f:
        pickle.dump(identity_ids, f)
    faiss.write_index(index, faiss_path)

    write_manifest(
        args.workdir, "build_indexes",
        params=vars(args) | {"identities": len(identity_ids), "faces": len(face_ids)},
        inputs=[emb_path, idx_path, meta_path],
        outputs=[cent_path, ids_path, faiss_path],
    )
    print(f"Built centroid index for {len(identity_ids)} identities -> {faiss_path}")


if __name__ == "__main__":
    main()
