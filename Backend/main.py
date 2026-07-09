"""FaceVault API — identity-scoped face retrieval backend (Phase-6).

Pipeline per query face:
  crop -> embed (InceptionResnetV1 / VGGFace2) -> identity routing (FAISS
  centroid index) -> identity-scoped retrieval -> centroid-similarity
  filtering -> confidence grouping.

Run:  uvicorn main:app --reload
"""

import io
import json
import mimetypes
import os
import pickle
import threading
import time
import uuid
import zipfile
from collections import deque
from datetime import datetime, timedelta, timezone

import faiss
import numpy as np
import pandas as pd
import torch
from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from facenet_pytorch import MTCNN, InceptionResnetV1
from PIL import Image

from logic import (
    MIN_RETRY,
    THRESH_STRONG,
    THRESH_WEAK,
    choose_threshold,
    clamp_box,
    normalize,
    replay_feedback,
    route_status,
)

# =========================================================
#                  APP + CORS + TIMING
# =========================================================
app = FastAPI(title="FaceVault Backend", version="1.0.0")

# Wildcard origins with credentials is rejected by browsers; pin origins
# and allow overriding for deployment via env var.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "FACEVAULT_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8080,http://127.0.0.1:8080",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time"],
)


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """Real server-side processing time; the UI telemetry panel reads this."""
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Process-Time"] = f"{time.perf_counter() - start:.4f}"
    return response


# =========================================================
#                  MODELS (same as Phase-4)
# =========================================================
device = "cuda" if torch.cuda.is_available() else "cpu"

mtcnn = MTCNN(keep_all=True, device=device)
embed_model = InceptionResnetV1(pretrained="vggface2").eval().to(device)

# Endpoints are plain `def`, so FastAPI runs them in a threadpool; serialize
# model access since the models are shared across those threads.
INFERENCE_LOCK = threading.Lock()


# =========================================================
#                  DATA ASSETS
# =========================================================
DATA_DIR = "data"
BASE_IMG_DIR = os.path.join(DATA_DIR, "VGGFace2")

META_DF = pd.read_csv(f"{DATA_DIR}/face_metadata.csv")
META_DF["face_id"] = META_DF["face_id"].astype(str)

EMB = np.load(f"{DATA_DIR}/face_embeddings.npy").astype("float32")
FACE_IDS = (
    pd.read_csv(f"{DATA_DIR}/face_embedding_index.csv")["face_id"].astype(str).tolist()
)
ID_TO_ROW = {fid: i for i, fid in enumerate(FACE_IDS)}

with open(f"{DATA_DIR}/identity_ids.pkl", "rb") as f:
    IDENTITY_IDS = pickle.load(f)
identity_index = faiss.read_index(f"{DATA_DIR}/identity_faiss.index")


# =========================================================
#              IN-MEMORY STATE (all bounded)
# =========================================================
RECENT_SEARCHES = deque(maxlen=100)
SEARCH_LOG = deque(maxlen=5000)
FEEDBACK_LOG = deque(maxlen=1000)
FEEDBACK_FILE = os.path.join(DATA_DIR, "feedback_log.jsonl")


def load_feedback_state():
    """Replay the persisted feedback log; later records override earlier ones."""
    records = []
    if os.path.exists(FEEDBACK_FILE):
        with open(FEEDBACK_FILE, encoding="utf-8") as f:
            for line in f:
                try:
                    records.append(json.loads(line))
                except ValueError:
                    continue
    return replay_feedback(records)


# Human-in-the-loop corrections applied to every subsequent search:
# rejected faces are excluded from results, promoted faces are always
# grouped as high-confidence.
REJECTED_FACE_IDS, PROMOTED_FACE_IDS = load_feedback_state()


# =========================================================
#     CONSTANTS — PHASE-4 (thresholds live in logic.py)
# =========================================================
TOP_K_ID = 5
MAX_ITERS = 3
TOP_K = 800


# =========================================================
#                     HELPERS
# =========================================================
def crop_box(img_pil, box):
    """Crop the face region for an explicit bounding box {x, y, width, height}."""
    try:
        coords = clamp_box(
            img_pil.width,
            img_pil.height,
            box["x"],
            box["y"],
            box["x"] + box["width"],
            box["y"] + box["height"],
        )
    except (KeyError, TypeError):
        return None
    if coords is None:
        return None
    return img_pil.crop(coords)


def embed_faces_batch(crops):
    """Embed several face crops in a single forward pass."""
    if not crops:
        return []

    arrs = []
    for crop in crops:
        img = crop.resize((160, 160))
        arr = np.float32(img) / 255.0
        arr = (arr - 0.5) / 0.5
        arrs.append(np.transpose(arr, (2, 0, 1)))

    t = torch.tensor(np.stack(arrs)).to(device)
    with INFERENCE_LOCK, torch.no_grad():
        embs = embed_model(t).cpu().numpy()

    return [normalize(e).astype("float32") for e in embs]


def detect_best_crop(img_pil):
    """Detect faces and crop the highest-confidence one (fallback when the
    client does not specify which face to search)."""
    with INFERENCE_LOCK:
        boxes, probs = mtcnn.detect(img_pil)

    if boxes is None or len(boxes) == 0:
        return None

    i = int(np.argmax(probs)) if probs is not None else 0
    x1, y1, x2, y2 = boxes[i]
    coords = clamp_box(img_pil.width, img_pil.height, x1, y1, x2, y2)
    if coords is None:
        return None
    return img_pil.crop(coords)


# =========================================================
#                PHASE-4: IDENTITY ROUTING
# =========================================================
def predict_identity(query_vec):
    q = normalize(query_vec).reshape(1, -1)
    sims, idxs = identity_index.search(q, TOP_K_ID)

    sims = sims[0]
    idxs = idxs[0]

    best_sim = float(sims[0])
    best_id = IDENTITY_IDS[idxs[0]]
    second_sim = float(sims[1]) if len(sims) > 1 else -1.0
    margin = best_sim - second_sim

    return dict(
        status=route_status(best_sim, margin),
        identity_id=best_id,
        best_sim=best_sim,
        second_sim=second_sim,
        margin=margin,
        similarity=best_sim,
    )


# =========================================================
#         SEARCH WITHIN A SINGLE IDENTITY (FAISS)
# =========================================================
def faiss_search_identity(vec, identity_id):
    subset = META_DF[META_DF.identity_id == identity_id]
    if len(subset) == 0:
        return pd.DataFrame()

    idxs = [ID_TO_ROW[fid] for fid in subset.face_id]
    sims = EMB[idxs] @ vec.reshape(-1)

    top_idx = np.argsort(-sims)[:TOP_K]
    df_hits = subset.iloc[top_idx].copy()

    df_hits["cosine"] = sims[top_idx]
    return df_hits


def recursive_face_search_identity(query_vec, identity_id):
    """Phase-4 recursive cluster expansion around the query."""
    centroid = normalize(query_vec)
    all_hits = pd.DataFrame()
    flagged_bad = False
    reason = []
    last_count = 0

    for _ in range(MAX_ITERS):
        hits = faiss_search_identity(centroid, identity_id)

        if len(hits) == 0:
            flagged_bad = True
            reason.append("no_hits_for_identity")
            break

        strong = hits[hits.cosine >= THRESH_STRONG]
        weak = hits[(hits.cosine < THRESH_STRONG) & (hits.cosine >= THRESH_WEAK)]

        if len(strong) == 0:
            flagged_bad = True
            reason.append("no_strong_matches")
            break

        all_hits = (
            pd.concat([all_hits, strong, weak])
            .drop_duplicates("face_id")
            .reset_index(drop=True)
        )

        idx = [ID_TO_ROW[fid] for fid in all_hits.face_id]
        centroid = normalize(EMB[idx].mean(axis=0))

        if len(all_hits) == last_count:
            break
        last_count = len(all_hits)

    return all_hits, flagged_bad, reason


# =========================================================
#             FINAL FILTER — PHASE-4
# =========================================================
def build_centroid(df):
    idx = [ID_TO_ROW[fid] for fid in df.face_id]
    vecs = EMB[idx]
    centroid = normalize(vecs.mean(axis=0))
    sims = vecs @ centroid
    return centroid, float(np.mean(sims))


def final_filter(df, identity_id, status):
    if len(df) == 0:
        return df, 0.0, 0.0, 0.0, True, ["no_candidates"]

    centroid, cmean = build_centroid(df)
    thresh = choose_threshold(cmean, status)

    df = df.copy()
    idx = [ID_TO_ROW[fid] for fid in df.face_id]
    df["cos_centroid"] = EMB[idx] @ centroid

    filtered = df[df.cos_centroid >= thresh].copy()

    if len(filtered) == 0:
        return filtered, 0.0, cmean, thresh, True, ["empty_after_filter"]

    precision = float((filtered.identity_id == identity_id).mean())
    strong_count = int((filtered.cos_centroid >= 0.55).sum())

    bad = precision < 0.50 or strong_count < 5 or cmean < 0.50
    reasons = []
    if precision < 0.50:
        reasons.append("precision<0.5")
    if strong_count < 5:
        reasons.append("few_strong_matches")
    if cmean < 0.50:
        reasons.append("weak_centroid")
    if status == "gray_zone":
        reasons.append("low_confidence_identity_assignment")

    return filtered, precision, cmean, thresh, bad, reasons


# =========================================================
#             FULL PER-FACE SEARCH PIPELINE
# =========================================================
def run_identity_search(q_vec, log_this=True):
    t0 = time.perf_counter()

    decision = predict_identity(q_vec)
    status = decision["status"]
    identity = decision["identity_id"]
    best_sim = decision["best_sim"]

    routing_flagged = False
    routing_reasons = []

    if status == "ambiguous":
        routing_flagged = True
        routing_reasons.append("ambiguous_identity_routing")

    if status == "new_identity":
        if best_sim >= MIN_RETRY and identity:
            status = "gray_zone"
            routing_flagged = True
            routing_reasons.append("fallback_retry_low_confidence")
        else:
            if log_this:
                log_search(status, 0.0, None)
            return {
                "query_id": str(uuid.uuid4()),
                "faces_detected": 1,
                "routing": decision,
                "cluster": None,
                "results": [],
                "timings": {"search_ms": (time.perf_counter() - t0) * 1000},
            }

    results_df, flagged_bad, reasons = recursive_face_search_identity(q_vec, identity)
    final_df, prec, cmean, thr, bad2, why2 = final_filter(results_df, identity, status)

    bad = routing_flagged or flagged_bad or bad2
    why = reasons + why2 + routing_reasons

    # Apply human-in-the-loop corrections from previous sessions
    results = []
    excluded = 0
    for _, row in final_df.iterrows():
        fid = str(row.face_id)
        if fid in REJECTED_FACE_IDS:
            excluded += 1
            continue
        results.append(
            {
                "face_id": fid,
                "photo_url": f"/api/v1/photo/{fid}",
                "cosine_similarity": float(row.cosine),
                "centroid_similarity": float(row.cos_centroid),
                "identity_id": str(row.identity_id),
                "group": (
                    "high_confidence"
                    if fid in PROMOTED_FACE_IDS or row.cos_centroid >= 0.55
                    else "borderline"
                ),
            }
        )
    if excluded:
        why.append(f"human_feedback_excluded_{excluded}")

    if log_this:
        log_search(status, prec, identity)

    return {
        "query_id": str(uuid.uuid4()),
        "faces_detected": 1,
        "routing": decision,
        "cluster": {
            "centroid_similarity": cmean,
            "threshold_used": thr,
            "precision_estimate": prec,
            "flagged_unreliable": bad,
            "flags": why,
        },
        "results": results,
        "timings": {"search_ms": (time.perf_counter() - t0) * 1000},
    }


def log_search(status, precision, identity):
    now = datetime.now(timezone.utc)
    SEARCH_LOG.append(
        dict(ts=now, identity=identity, precision=precision, status=status)
    )
    RECENT_SEARCHES.appendleft(
        {
            "timestamp": now.isoformat(),
            "status": status,
            "precision": precision,
            "identity": identity,
        }
    )


def resolve_photo_path(face_id: str):
    """Map a face_id to its image file, refusing paths outside the dataset root."""
    row = META_DF[META_DF.face_id == str(face_id)]
    if row.empty:
        return None

    raw = str(row.iloc[0].photo_path)
    raw = raw.replace("/kaggle/input/vggface2", "").lstrip("/\\")

    base = os.path.abspath(BASE_IMG_DIR)
    local = os.path.abspath(os.path.join(base, raw))

    if not local.startswith(base + os.sep):
        return None
    if not os.path.exists(local):
        return None
    return local


# =========================================================
#                    API ROUTES
# =========================================================
@app.get("/api/v1/health")
def health():
    return {
        "status": "ok",
        "device": device,
        "faces_indexed": len(FACE_IDS),
        "identities": len(IDENTITY_IDS),
        "feedback": {
            "rejected": len(REJECTED_FACE_IDS),
            "promoted": len(PROMOTED_FACE_IDS),
        },
    }


@app.post("/api/v1/detect-faces")
def detect_faces(image: UploadFile = File(...)):
    img = Image.open(io.BytesIO(image.file.read())).convert("RGB")

    with INFERENCE_LOCK:
        boxes, probs = mtcnn.detect(img)

    faces = []
    if boxes is not None:
        for box, conf in zip(boxes, probs):
            if conf is None:
                continue
            x1, y1, x2, y2 = box
            faces.append(
                {
                    "id": str(uuid.uuid4()),
                    "boundingBox": {
                        "x": int(x1),
                        "y": int(y1),
                        "width": int(x2 - x1),
                        "height": int(y2 - y1),
                    },
                    "confidence": float(conf),
                }
            )
    return faces


@app.post("/api/v1/search")
def search_face(
    image: UploadFile = File(...),
    boxes: str = Form(None),
    log_query: str = Form("true"),
):
    """Search one or more faces from the uploaded image.

    `boxes` is an optional JSON list of {x, y, width, height} bounding boxes —
    the faces the user actually selected in the UI. Without it, the single
    highest-confidence face is searched (legacy behavior).

    `log_query=false` runs the search without writing it to the recent-search
    log (the UI privacy toggle).

    Returns one response object for a single query face, or a list of
    response objects for a multi-face query.
    """
    img = Image.open(io.BytesIO(image.file.read())).convert("RGB")
    log_this = str(log_query).lower() != "false"

    query_boxes = None
    if boxes:
        try:
            parsed = json.loads(boxes)
            if isinstance(parsed, list) and parsed:
                query_boxes = parsed
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="invalid_boxes_json")

    if query_boxes is None:
        crops = [detect_best_crop(img)]
    else:
        crops = [crop_box(img, b) for b in query_boxes]

    crops = [c for c in crops if c is not None]
    if not crops:
        raise HTTPException(status_code=400, detail="no_face_detected")

    # All selected faces are embedded in one forward pass
    vectors = embed_faces_batch(crops)

    responses = [run_identity_search(v, log_this) for v in vectors]
    return responses[0] if len(responses) == 1 else responses


@app.get("/api/v1/photo/{face_id}")
def get_photo(face_id: str):
    path = resolve_photo_path(face_id)
    if path is None:
        raise HTTPException(status_code=404, detail="photo_not_found")

    media_type = mimetypes.guess_type(path)[0] or "image/jpeg"
    return FileResponse(path, media_type=media_type)


@app.post("/api/v1/download-results")
def download_results(payload: dict = Body(...)):
    face_ids = [str(f) for f in payload.get("face_ids", [])]
    if not face_ids:
        raise HTTPException(status_code=400, detail="no_face_ids_provided")

    bio = io.BytesIO()
    added = 0

    with zipfile.ZipFile(bio, "w", zipfile.ZIP_DEFLATED) as zf:
        for fid in face_ids:
            path = resolve_photo_path(fid)
            if path is None:
                continue
            ext = os.path.splitext(path)[1] or ".jpg"
            zf.write(path, arcname=f"{fid}{ext}")
            added += 1

    if added == 0:
        raise HTTPException(status_code=404, detail="no_files_found")

    bio.seek(0)
    return StreamingResponse(
        bio,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=facevault_results.zip"},
    )


@app.post("/api/v1/feedback")
def submit_feedback(payload: dict = Body(...)):
    """Record human-in-the-loop corrections (promote / reject-false-positive).

    Kept in a bounded in-memory log and appended to a JSONL file so feedback
    survives restarts and can later drive threshold recalibration.
    """
    action = payload.get("action")
    face_id = str(payload.get("face_id", "")).strip()

    if action not in ("promote", "reject_false_positive") or not face_id:
        raise HTTPException(status_code=400, detail="invalid_feedback")

    record = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "face_id": face_id,
        "threshold_used": payload.get("threshold_used"),
    }

    FEEDBACK_LOG.appendleft(record)

    # Apply immediately to future searches
    if action == "reject_false_positive":
        REJECTED_FACE_IDS.add(face_id)
        PROMOTED_FACE_IDS.discard(face_id)
    else:
        PROMOTED_FACE_IDS.add(face_id)
        REJECTED_FACE_IDS.discard(face_id)

    try:
        with open(FEEDBACK_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except OSError:
        pass  # in-memory record still stands; don't fail the request

    return {"status": "recorded", "id": record["id"]}


@app.get("/api/v1/feedback")
def list_feedback():
    return list(FEEDBACK_LOG)


@app.get("/api/v1/stats")
def get_stats():
    now = datetime.now(timezone.utc)
    cutoff_30 = now - timedelta(days=30)

    recent = [x for x in SEARCH_LOG if x["ts"] >= cutoff_30]
    total_queries = len(recent)

    avg_precision = (
        sum(x["precision"] for x in recent) / total_queries if total_queries else 0.0
    )
    ambiguous = [x for x in recent if x["status"] in ("ambiguous", "gray_zone")]
    ambiguous_rate = len(ambiguous) / total_queries * 100 if total_queries else 0.0
    identities_seen = len({x["identity"] for x in recent if x["identity"]})

    return dict(
        total_queries=total_queries,
        avg_precision=avg_precision,
        ambiguous_rate=ambiguous_rate,
        new_identities=identities_seen,
    )


@app.get("/api/v1/recent-searches")
def get_recent_searches():
    return list(RECENT_SEARCHES)
