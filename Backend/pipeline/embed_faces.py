"""Phase-2: embed extracted face crops into L2-normalized 512-D vectors.

Inputs:   <workdir>/face_metadata.csv  (+ the crop files it references)
Outputs:  <workdir>/face_embeddings.npy, <workdir>/face_embedding_index.csv

Uses the same vendored, hash-pinnable weights as the API (config.settings).

Usage:
  python -m pipeline.embed_faces --workdir data/pipeline_out --batch-size 64
"""

import argparse
import os
import sys

import numpy as np
import pandas as pd
import torch
from PIL import Image
from tqdm import tqdm

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from config import settings  # noqa: E402
from logic import normalize  # noqa: E402
from pipeline.manifest import write_manifest  # noqa: E402


def load_model(device):
    from facenet_pytorch import InceptionResnetV1

    path = settings.weights_path
    if os.path.exists(path):
        # classify=True builds the logits head so the state dict loads
        # strictly; flipped off so forward() returns embeddings.
        model = InceptionResnetV1(classify=True, num_classes=8631)
        model.load_state_dict(torch.load(path, map_location="cpu"))
        model.classify = False
    else:
        model = InceptionResnetV1(pretrained="vggface2")
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        torch.save(model.state_dict(), path)
    return model.eval().to(device)


def preprocess(img):
    arr = np.float32(img.resize((160, 160))) / 255.0
    arr = (arr - 0.5) / 0.5
    return np.transpose(arr, (2, 0, 1))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--workdir", required=True)
    ap.add_argument("--batch-size", type=int, default=64)
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = load_model(device)

    meta_path = os.path.join(args.workdir, "face_metadata.csv")
    meta = pd.read_csv(meta_path)
    meta["face_id"] = meta["face_id"].astype(str)

    vectors = []
    face_ids = []
    batch, batch_ids = [], []

    def flush():
        if not batch:
            return
        t = torch.tensor(np.stack(batch)).to(device)
        with torch.no_grad():
            out = model(t).cpu().numpy()
        for fid, vec in zip(batch_ids, out):
            face_ids.append(fid)
            vectors.append(normalize(vec).astype("float32"))
        batch.clear()
        batch_ids.clear()

    for _, row in tqdm(meta.iterrows(), total=len(meta), desc="embedding"):
        try:
            img = Image.open(row.face_path).convert("RGB")
        except OSError:
            continue
        batch.append(preprocess(img))
        batch_ids.append(row.face_id)
        if len(batch) >= args.batch_size:
            flush()
    flush()

    emb_path = os.path.join(args.workdir, "face_embeddings.npy")
    idx_path = os.path.join(args.workdir, "face_embedding_index.csv")
    np.save(emb_path, np.stack(vectors) if vectors else np.zeros((0, 512), "float32"))
    pd.DataFrame({"face_id": face_ids}).to_csv(idx_path, index=False)

    write_manifest(
        args.workdir, "embed_faces",
        params=vars(args) | {"device": device, "embedded": len(face_ids),
                             "weights_path": settings.weights_path},
        inputs=[meta_path],
        outputs=[emb_path, idx_path],
    )
    print(f"Embedded {len(face_ids)} faces -> {emb_path}")


if __name__ == "__main__":
    main()
