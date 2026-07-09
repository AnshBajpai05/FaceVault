"""Phase-1: detect faces in a per-identity image tree and write crops + metadata.

Input layout:  <src>/<identity_id>/<photo>.jpg
Outputs:       <out>/crops/<face_id>.jpg  and  <out>/face_metadata.csv
               (same schema as the original Kaggle-era metadata)

Usage:
  python -m pipeline.extract_faces --src data/VGGFace2/val --out data/pipeline_out \
      --limit-identities 2 --limit-photos 10
"""

import argparse
import csv
import os
import sys
import uuid

import numpy as np
import torch
from PIL import Image
from tqdm import tqdm

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from logic import clamp_box  # noqa: E402
from pipeline.manifest import write_manifest  # noqa: E402

FIELDS = [
    "face_id", "photo_id", "identity_id", "photo_path", "face_path",
    "x", "y", "w", "h", "confidence",
]
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src", required=True, help="root dir: <src>/<identity>/<photo>")
    ap.add_argument("--out", required=True)
    ap.add_argument("--min-confidence", type=float, default=0.90)
    ap.add_argument("--limit-identities", type=int, default=0, help="0 = all")
    ap.add_argument("--limit-photos", type=int, default=0, help="per identity; 0 = all")
    args = ap.parse_args()

    from facenet_pytorch import MTCNN

    device = "cuda" if torch.cuda.is_available() else "cpu"
    mtcnn = MTCNN(keep_all=True, device=device)

    crops_dir = os.path.join(args.out, "crops")
    os.makedirs(crops_dir, exist_ok=True)

    identities = sorted(
        d for d in os.listdir(args.src) if os.path.isdir(os.path.join(args.src, d))
    )
    if args.limit_identities:
        identities = identities[: args.limit_identities]

    rows = []
    for ident in tqdm(identities, desc="identities"):
        ident_dir = os.path.join(args.src, ident)
        photos = sorted(
            f for f in os.listdir(ident_dir)
            if os.path.splitext(f)[1].lower() in IMAGE_EXTS
        )
        if args.limit_photos:
            photos = photos[: args.limit_photos]

        for photo in photos:
            path = os.path.join(ident_dir, photo)
            try:
                img = Image.open(path).convert("RGB")
            except OSError:
                continue

            boxes, probs = mtcnn.detect(img)
            if boxes is None:
                continue

            for box, conf in zip(boxes, probs):
                if conf is None or conf < args.min_confidence:
                    continue
                coords = clamp_box(img.width, img.height, *box)
                if coords is None:
                    continue
                x1, y1, x2, y2 = coords

                face_id = str(uuid.uuid4())
                face_path = os.path.join(crops_dir, f"{face_id}.jpg")
                img.crop(coords).save(face_path, quality=95)

                rows.append(
                    dict(
                        face_id=face_id,
                        photo_id=photo,
                        identity_id=ident,
                        photo_path=os.path.relpath(path, args.src).replace("\\", "/"),
                        face_path=face_path,
                        x=x1, y=y1, w=x2 - x1, h=y2 - y1,
                        confidence=float(conf),
                    )
                )

    meta_path = os.path.join(args.out, "face_metadata.csv")
    with open(meta_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    write_manifest(
        args.out, "extract_faces",
        params=vars(args) | {"device": device, "faces_extracted": len(rows)},
        outputs=[meta_path],
    )
    print(f"Extracted {len(rows)} faces from {len(identities)} identities -> {meta_path}")


if __name__ == "__main__":
    main()
