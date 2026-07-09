"""FaceVault API — identity-scoped face retrieval backend (Phase-6).

Pipeline per query face:
  crop -> embed (InceptionResnetV1 / VGGFace2) -> identity routing (FAISS
  centroid index) -> identity-scoped retrieval -> centroid-similarity
  filtering -> confidence grouping.

Run:  uvicorn main:app --reload
Configuration: FACEVAULT_* environment variables (see config.py).
"""

import hashlib
import io
import json
import logging
import mimetypes
import os
import pickle
import threading
import time
import uuid
import zipfile
from collections import defaultdict, deque

import faiss
import numpy as np
import pandas as pd
import torch
from fastapi import (
    Body,
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from facenet_pytorch import MTCNN, InceptionResnetV1
from PIL import Image, UnidentifiedImageError

import db
from config import settings
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("facevault")
log.info("Effective settings: %s", settings.summary())

# =========================================================
#                  APP + CORS + TIMING
# =========================================================
app = FastAPI(title="FaceVault Backend", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list(),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time"],
)


# In-process HTTP metrics: {(method, path_template, status): count} and
# per-path latency accumulators. Reset on restart by design; durable business
# metrics (search statuses, feedback) come from SQLite instead.
_HTTP_COUNTS = defaultdict(int)
_HTTP_LATENCY = defaultdict(lambda: [0.0, 0])  # path -> [sum_seconds, count]
_METRICS_LOCK = threading.Lock()
_STARTED_AT = time.time()


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """Real server-side processing time; the UI telemetry panel reads this.
    Also feeds the /metrics counters."""
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    response.headers["X-Process-Time"] = f"{elapsed:.4f}"

    path = request.url.path
    if path.startswith("/api/v1/photo/"):
        path = "/api/v1/photo/{face_id}"  # collapse per-face cardinality
    with _METRICS_LOCK:
        _HTTP_COUNTS[(request.method, path, response.status_code)] += 1
        acc = _HTTP_LATENCY[path]
        acc[0] += elapsed
        acc[1] += 1
    return response


# =========================================================
#             SECURITY: API KEY + RATE LIMIT
# =========================================================
def require_api_key(x_api_key: str = Header(None)):
    """Enforced only when FACEVAULT_API_KEY is set; open in local dev."""
    if settings.api_key and x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="invalid_api_key")


_RATE_BUCKETS = defaultdict(deque)
_RATE_LOCK = threading.Lock()


def rate_limit(request: Request):
    """Sliding-window per-IP limit on inference endpoints."""
    limit = settings.rate_limit_per_minute
    if limit <= 0:
        return
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _RATE_LOCK:
        bucket = _RATE_BUCKETS[key]
        while bucket and now - bucket[0] > 60.0:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(status_code=429, detail="rate_limit_exceeded")
        bucket.append(now)


GUARDED = [Depends(require_api_key), Depends(rate_limit)]


def read_image_upload(image: UploadFile):
    """Decode an uploaded image with size, validity, and pixel-count guards."""
    contents = image.file.read(settings.max_upload_bytes + 1)
    if len(contents) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="upload_too_large")
    try:
        img = Image.open(io.BytesIO(contents))
        img.verify()  # cheap structural check before full decode
        img = Image.open(io.BytesIO(contents)).convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(status_code=400, detail="invalid_image")
    if img.width * img.height > settings.max_image_pixels:
        raise HTTPException(status_code=400, detail="image_too_large")
    return img


# =========================================================
#          MODELS (weights vendored + hash-pinned)
# =========================================================
device = "cuda" if torch.cuda.is_available() else "cpu"

mtcnn = MTCNN(keep_all=True, device=device)


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_embed_model():
    """Load InceptionResnetV1 from a local, hash-verifiable weights file.

    First run without a local file falls back to the facenet-pytorch download,
    then vendors the weights to settings.weights_path and logs their SHA-256
    so it can be pinned via FACEVAULT_WEIGHTS_SHA256. After that, startup
    never needs the network.
    """
    path = settings.weights_path
    if os.path.exists(path):
        if settings.weights_sha256:
            digest = _sha256(path)
            if digest != settings.weights_sha256.lower():
                raise RuntimeError(
                    f"Weights hash mismatch for {path}: got {digest}, "
                    f"expected {settings.weights_sha256}"
                )
        # classify=True builds the 8631-way logits head so the full vggface2
        # state dict loads strictly; flipped off afterwards so forward()
        # returns embeddings.
        model = InceptionResnetV1(classify=True, num_classes=8631)
        model.load_state_dict(torch.load(path, map_location="cpu"))
        model.classify = False
        log.info("Loaded embedding weights from %s", path)
    else:
        log.warning("Local weights not found at %s — downloading once", path)
        model = InceptionResnetV1(pretrained="vggface2")
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        torch.save(model.state_dict(), path)
        log.info(
            "Vendored weights to %s (sha256=%s) — set FACEVAULT_WEIGHTS_SHA256 to pin",
            path,
            _sha256(path),
        )
    return model.eval().to(device)


embed_model = load_embed_model()

# Endpoints are plain `def`, so FastAPI runs them in a threadpool; serialize
# model access since the models are shared across those threads.
INFERENCE_LOCK = threading.Lock()


# =========================================================
#                  DATA ASSETS
# =========================================================
DATA_DIR = settings.data_dir
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
#        PERSISTENT STATE (SQLite) + HITL FEEDBACK
# =========================================================
db.init(os.path.join(DATA_DIR, "facevault.db"))

# One-time migration from the pre-SQLite JSONL feedback log
_LEGACY_FEEDBACK = os.path.join(DATA_DIR, "feedback_log.jsonl")
if os.path.exists(_LEGACY_FEEDBACK):
    with open(_LEGACY_FEEDBACK, encoding="utf-8") as f:
        legacy = []
        for line in f:
            try:
                legacy.append(json.loads(line))
            except ValueError:
                continue
    migrated = db.import_legacy_feedback(legacy)
    if migrated:
        log.info("Migrated %d legacy feedback records into SQLite", migrated)

# Human-in-the-loop corrections applied to every subsequent search:
# rejected faces are excluded from results, promoted faces are always
# grouped as high-confidence. Replayed from the database at startup.
REJECTED_FACE_IDS, PROMOTED_FACE_IDS = replay_feedback(db.all_feedback_ordered())
log.info(
    "Feedback state: %d rejected, %d promoted",
    len(REJECTED_FACE_IDS),
    len(PROMOTED_FACE_IDS),
)

TOP_K_ID = settings.top_k_identities
MAX_ITERS = settings.max_expansion_iters
TOP_K = settings.top_k_results


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
    """Phase-4 recursive cluster expansion around the query.

    Also measures total centroid drift (L2 displacement summed across
    iterations) so downstream consumers can audit expansion stability —
    a drifting centroid means weak matches are pulling the cluster.
    """
    centroid = normalize(query_vec)
    all_hits = pd.DataFrame()
    flagged_bad = False
    reason = []
    last_count = 0
    total_drift = 0.0

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
        new_centroid = normalize(EMB[idx].mean(axis=0))
        total_drift += float(np.linalg.norm(new_centroid - centroid))
        centroid = new_centroid

        if len(all_hits) == last_count:
            break
        last_count = len(all_hits)

    return all_hits, flagged_bad, reason, total_drift


# =========================================================
#             FINAL FILTER — PHASE-4
# =========================================================
def build_centroid(df):
    idx = [ID_TO_ROW[fid] for fid in df.face_id]
    vecs = EMB[idx]
    centroid = normalize(vecs.mean(axis=0))
    sims = vecs @ centroid
    return centroid, float(np.mean(sims))


def final_filter(df, status):
    """Centroid-similarity filtering with an honest quality signal.

    Note: results are already identity-scoped, so "precision vs the routed
    identity" would be 1.0 by construction and is deliberately NOT reported.
    strong_match_ratio (share of surviving results with high centroid
    similarity) is the meaningful runtime confidence signal.
    """
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

    strong_count = int((filtered.cos_centroid >= 0.55).sum())
    strong_ratio = strong_count / len(filtered)

    bad = strong_count < 5 or cmean < 0.50
    reasons = []
    if strong_count < 5:
        reasons.append("few_strong_matches")
    if cmean < 0.50:
        reasons.append("weak_centroid")
    if status == "gray_zone":
        reasons.append("low_confidence_identity_assignment")

    return filtered, float(strong_ratio), cmean, thresh, bad, reasons


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
                db.record_search(status, 0.0, None)
            return {
                "query_id": str(uuid.uuid4()),
                "faces_detected": 1,
                "routing": decision,
                "cluster": None,
                "results": [],
                "timings": {"search_ms": (time.perf_counter() - t0) * 1000},
            }

    results_df, flagged_bad, reasons, drift = recursive_face_search_identity(
        q_vec, identity
    )
    final_df, strong_ratio, cmean, thr, bad2, why2 = final_filter(results_df, status)

    bad = routing_flagged or flagged_bad or bad2
    why = reasons + why2 + routing_reasons
    if drift > 0.25:
        why.append("centroid_drift_high")

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
        db.record_search(status, strong_ratio, identity)

    return {
        "query_id": str(uuid.uuid4()),
        "faces_detected": 1,
        "routing": decision,
        "cluster": {
            "centroid_similarity": cmean,
            "threshold_used": thr,
            "strong_match_ratio": strong_ratio,
            "centroid_drift": drift,
            "flagged_unreliable": bad,
            "flags": why,
        },
        "results": results,
        "timings": {"search_ms": (time.perf_counter() - t0) * 1000},
    }


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
        "auth_enabled": bool(settings.api_key),
        "feedback": {
            "rejected": len(REJECTED_FACE_IDS),
            "promoted": len(PROMOTED_FACE_IDS),
        },
    }


@app.post("/api/v1/detect-faces", dependencies=GUARDED)
def detect_faces(image: UploadFile = File(...)):
    img = read_image_upload(image)

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


@app.post("/api/v1/search", dependencies=GUARDED)
def search_face(
    image: UploadFile = File(...),
    boxes: str = Form(None),
    log_query: str = Form("true"),
):
    """Search one or more faces from the uploaded image.

    `boxes` is an optional JSON list of {x, y, width, height} bounding boxes —
    the faces the user actually selected in the UI. Without it, the single
    highest-confidence face is searched (legacy behavior).

    `log_query=false` runs the search without writing it to the search log
    (the UI privacy toggle).

    Returns one response object for a single query face, or a list of
    response objects for a multi-face query.
    """
    img = read_image_upload(image)
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


@app.post("/api/v1/download-results", dependencies=[Depends(require_api_key)])
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


@app.post("/api/v1/feedback", dependencies=[Depends(require_api_key)])
def submit_feedback(payload: dict = Body(...)):
    """Record human-in-the-loop corrections (promote / reject-false-positive).

    Persisted in SQLite and applied to every future search; replayed at
    startup so corrections survive restarts.
    """
    action = payload.get("action")
    face_id = str(payload.get("face_id", "")).strip()

    if action not in ("promote", "reject_false_positive") or not face_id:
        raise HTTPException(status_code=400, detail="invalid_feedback")

    record = db.record_feedback(action, face_id, payload.get("threshold_used"))

    # Apply immediately to future searches
    if action == "reject_false_positive":
        REJECTED_FACE_IDS.add(face_id)
        PROMOTED_FACE_IDS.discard(face_id)
    else:
        PROMOTED_FACE_IDS.add(face_id)
        REJECTED_FACE_IDS.discard(face_id)

    return {"status": "recorded", "id": record["id"]}


@app.get("/api/v1/feedback")
def list_feedback():
    return db.recent_feedback()


@app.get("/api/v1/stats")
def get_stats():
    return db.stats(days=30)


@app.get("/api/v1/recent-searches")
def get_recent_searches():
    return db.recent_searches(limit=100)


@app.get("/metrics")
def metrics():
    """Prometheus text-format metrics.

    A rising `facevault_searches_total{status="new_identity"}` rate is the
    earliest signal that the input distribution has drifted away from the
    indexed corpus.
    """
    lines = [
        "# TYPE facevault_uptime_seconds gauge",
        f"facevault_uptime_seconds {time.time() - _STARTED_AT:.0f}",
        "# TYPE facevault_faces_indexed gauge",
        f"facevault_faces_indexed {len(FACE_IDS)}",
        "# TYPE facevault_identities gauge",
        f"facevault_identities {len(IDENTITY_IDS)}",
        "# TYPE facevault_feedback_rejected gauge",
        f"facevault_feedback_rejected {len(REJECTED_FACE_IDS)}",
        "# TYPE facevault_feedback_promoted gauge",
        f"facevault_feedback_promoted {len(PROMOTED_FACE_IDS)}",
    ]

    lines.append("# TYPE facevault_searches_total counter")
    for status, n in sorted(db.search_status_counts().items()):
        lines.append(f'facevault_searches_total{{status="{status}"}} {n}')

    lines.append("# TYPE facevault_feedback_total counter")
    for action, n in sorted(db.feedback_action_counts().items()):
        lines.append(f'facevault_feedback_total{{action="{action}"}} {n}')

    with _METRICS_LOCK:
        http_counts = dict(_HTTP_COUNTS)
        latencies = {k: tuple(v) for k, v in _HTTP_LATENCY.items()}

    lines.append("# TYPE facevault_http_requests_total counter")
    for (method, path, status), n in sorted(http_counts.items()):
        lines.append(
            f'facevault_http_requests_total{{method="{method}",path="{path}",status="{status}"}} {n}'
        )

    lines.append("# TYPE facevault_http_request_seconds summary")
    for path, (total, count) in sorted(latencies.items()):
        lines.append(f'facevault_http_request_seconds_sum{{path="{path}"}} {total:.4f}')
        lines.append(f'facevault_http_request_seconds_count{{path="{path}"}} {count}')

    return PlainTextResponse("\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")
