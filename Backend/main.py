from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import io, uuid, pickle
import numpy as np
import pandas as pd
import torch
import faiss
import os
from facenet_pytorch import MTCNN, InceptionResnetV1

from collections import deque
RECENT_SEARCHES = deque(maxlen=100)


# =========================================================
#                  FASTAPI + CORS
# =========================================================
app = FastAPI(title="FaceVault Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
#              LOAD MODELS (SAME AS PHASE-4)
# =========================================================
device = "cuda" if torch.cuda.is_available() else "cpu"

mtcnn = MTCNN(keep_all=True, device=device)
embed_model = InceptionResnetV1(pretrained="vggface2").eval().to(device)


# =========================================================
#                  LOAD DATA ASSETS
# =========================================================
DATA_DIR = "data"
BASE_IMG_DIR = os.path.join(DATA_DIR, "VGGFace2")   # <-- your dataset root

META_DF = pd.read_csv(f"{DATA_DIR}/face_metadata.csv")
EMB = np.load(f"{DATA_DIR}/face_embeddings.npy").astype("float32")
FACE_IDS = pd.read_csv(f"{DATA_DIR}/face_embedding_index.csv")["face_id"].astype(str).tolist()

ID_TO_ROW = {fid: i for i, fid in enumerate(FACE_IDS)}

IDENTITY_IDS = pickle.load(open(f"{DATA_DIR}/identity_ids.pkl", "rb"))
identity_index = faiss.read_index(f"{DATA_DIR}/identity_faiss.index")

from datetime import datetime, timedelta

SEARCH_LOG = []


# =========================================================
#                CONSTANTS — PHASE-4
# =========================================================
MIN_ACCEPT = 0.60
MIN_GRAY   = 0.55
MIN_RETRY  = 0.50
MARGIN_REQ = 0.05
TOP_K_ID   = 5

THRESH_STRONG = 0.60
THRESH_WEAK   = 0.45
MAX_ITERS     = 3
TOP_K         = 800


from fastapi.responses import StreamingResponse
import zipfile
import io
import os
from fastapi import FastAPI
from collections import defaultdict

QUERY_CACHE = {}
from fastapi import HTTPException, Body
from fastapi.responses import StreamingResponse
import io, zipfile, os

from fastapi import Body, HTTPException
from fastapi.responses import StreamingResponse
import zipfile, io, os

@app.post("/api/v1/download-results")
async def download_results(payload: dict = Body(...)):

    # ⭐ normalize everything to string
    face_ids = [str(f) for f in payload.get("face_ids", [])]

    if not face_ids:
        raise HTTPException(status_code=400, detail="no_face_ids_provided")

    bio = io.BytesIO()

    with zipfile.ZipFile(bio, "w", zipfile.ZIP_DEFLATED) as zf:
        added = 0

        for fid in face_ids:

            # ⭐ FORCE STRING MATCH (fixes type mismatch)
            row = META_DF[META_DF.face_id.astype(str) == fid]

            if row.empty:
                continue

            path = row.iloc[0].photo_path

            # ⭐ FIX RELATIVE PATHS
            if not os.path.isabs(path):
                path = os.path.join(DATA_DIR, path)

            # ⭐ ALSO handle Kaggle prefix
            path = path.replace("/kaggle/input/vggface2", BASE_IMG_DIR)

            if not os.path.exists(path):
                continue

            ext = os.path.splitext(path)[1] or ".jpg"

            # ⭐ put readable filename inside zip
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


def extract_face_embedding(img_pil):
    """
    Detect face -> crop -> embed -> L2-normalize.
    Returns None if NO face detected.
    """

    # --- Detect ---
    boxes, probs = mtcnn.detect(img_pil)

    if boxes is None or len(boxes) == 0:
        return None

    # pick highest confidence face
    if probs is not None:
        i = int(np.argmax(probs))
    else:
        i = 0

    x1, y1, x2, y2 = boxes[i]

    # clamp to valid region
    x1 = max(0, int(x1))
    y1 = max(0, int(y1))
    x2 = min(img_pil.width,  int(x2))
    y2 = min(img_pil.height, int(y2))

    if x2 <= x1 or y2 <= y1:
        return None

    # --- Crop face ---
    face = img_pil.crop((x1, y1, x2, y2))

    # --- Embed using SAME preprocessing ---
    return embed_face(face)



@app.post("/api/v1/detect-faces")
async def detect_faces(image: UploadFile = File(...)):

    contents = await image.read()
    img = Image.open(io.BytesIO(contents)).convert("RGB")

    # Run MTCNN (NO await — it is NOT async)
    boxes, probs = mtcnn.detect(img)

    faces = []

    if boxes is not None:
        for box, conf in zip(boxes, probs):

            if conf is None:
                continue

            x1, y1, x2, y2 = box

            faces.append({
                "id": str(uuid.uuid4()),
                "boundingBox": {
                    "x": int(x1),
                    "y": int(y1),
                    "width": int(x2 - x1),
                    "height": int(y2 - y1)
                },
                "confidence": float(conf)
            })

    return faces


# =========================================================
#                     HELPERS
# =========================================================
def normalize(v):
    v = np.asarray(v).astype("float32")
    return v / (np.linalg.norm(v) + 1e-10)


def embed_face(img_pil):
    img = img_pil.resize((160, 160))
    arr = np.float32(img) / 255.0
    arr = (arr - 0.5) / 0.5
    arr = np.transpose(arr, (2, 0, 1))
    t = torch.tensor(arr).unsqueeze(0).to(device)

    with torch.no_grad():
        emb = embed_model(t)[0].cpu().numpy()

    return normalize(emb).astype("float32")


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

    if best_sim >= MIN_ACCEPT and margin >= MARGIN_REQ:
        status = "accepted"
    elif best_sim >= MIN_GRAY:
        status = "ambiguous"
    elif best_sim >= MIN_RETRY:
        status = "gray_zone"
    else:
        status = "new_identity"

    return dict(
        status=status,
        identity_id=best_id,
        best_sim=best_sim,
        second_sim=second_sim,
        margin=margin,
        similarity=best_sim   # <-- UI SAFE FIELD
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
    df_hits["embedding"] = [EMB[ID_TO_ROW[fid]] for fid in df_hits.face_id]

    return df_hits


# =========================================================
#     PHASE-4 RECURSIVE CLUSTER EXPANSION
# =========================================================
def recursive_face_search_identity(query_vec, identity_id):

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

        strong = hits[hits.cosine >= THRESH_STRONG].copy()
        weak   = hits[(hits.cosine < THRESH_STRONG) & (hits.cosine >= THRESH_WEAK)]

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


def choose_threshold_phase4(cmean, status):

    if status in ("gray_zone", "ambiguous"):
        return 0.55
    if cmean > 0.80:
        return 0.45
    if cmean > 0.70:
        return 0.48
    return 0.50


def final_filter(df, identity_id, status):

    centroid, cmean = build_centroid(df)
    THRESH = choose_threshold_phase4(cmean, status)

    df = df.copy()
    df["cos_centroid"] = df.embedding.apply(
        lambda v: float(np.dot(normalize(v), centroid))
    )

    filtered = df[df.cos_centroid >= THRESH].copy()

    if len(filtered) == 0:
        return filtered, 0.0, cmean, THRESH, True, ["empty_after_filter"]

    precision = (filtered.identity_id == identity_id).mean()
    strong_count = (filtered.cos_centroid >= 0.55).sum()

    bad = precision < 0.50 or strong_count < 5 or cmean < 0.50
    reasons = []
    if precision < 0.50: reasons.append("precision<0.5")
    if strong_count < 5: reasons.append("few_strong_matches")
    if cmean < 0.50: reasons.append("weak_centroid")
    if status == "gray_zone": reasons.append("low_confidence_identity_assignment")

    return filtered, float(precision), cmean, THRESH, bad, reasons


# =========================================================
#                    API ROUTES
# =========================================================
@app.get("/api/v1/health")
async def health():
    return {"status": "ok"}

from fastapi import HTTPException, Response

@app.get("/api/v1/photo/{face_id}")
async def get_photo(face_id: str):

    row = META_DF[META_DF.face_id == face_id]

    if len(row) == 0:
        raise HTTPException(status_code=404, detail="face_not_found")

    raw_path = str(row.iloc[0].photo_path)

    # strip kaggle prefix if present
    raw_path = raw_path.replace("/kaggle/input/vggface2", "").lstrip("/")

    # build local path
    local_path = os.path.join(BASE_IMG_DIR, raw_path)

    if not os.path.exists(local_path):
        raise HTTPException(status_code=404, detail=f"file_missing: {local_path}")

    with open(local_path, "rb") as f:
        return Response(content=f.read(), media_type="image/jpeg")



from fastapi import HTTPException
import uuid

@app.post("/api/v1/search")
async def search_face(image: UploadFile = File(...)):

    img = Image.open(io.BytesIO(await image.read())).convert("RGB")
    q_vec = extract_face_embedding(img)

    if q_vec is None:
        raise HTTPException(status_code=400, detail="no_face_detected")

    # -------- Identity routing --------
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
            return {
                "query_id": str(uuid.uuid4()),
                "faces_detected": 1,
                "routing": decision,
                "cluster": None,
                "results": []
            }

    # -------- Search within identity --------
    results_df, flagged_bad, reasons = recursive_face_search_identity(
        q_vec, identity
    )

    # -------- Final filtering --------
    final_df, prec, cmean, thr, bad2, why2 = final_filter(
        results_df, identity, status
    )

    bad = routing_flagged or flagged_bad or bad2
    why = reasons + why2 + routing_reasons

    # -------- Create query_id + cache face_ids --------
    query_id = str(uuid.uuid4())
    QUERY_CACHE[query_id] = final_df.face_id.tolist()

    SEARCH_LOG.append(dict(
        ts=datetime.utcnow(),
        identity=identity,
        precision=prec,
        status=status,
        flagged=bad
    ))

    RECENT_SEARCHES.appendleft({
        "timestamp": datetime.utcnow().isoformat(),
        "status": status,
        "precision": prec,
        "identity": identity if status != "new_identity" else None
    })

    # -------- Build response --------
    return {
        "query_id": query_id,
        "faces_detected": 1,
        "routing": decision,
        "cluster": {
            "centroid_similarity": cmean,
            "threshold_used": thr,
            "precision_estimate": prec,
            "flagged_unreliable": bad,
            "flags": why
        },
        "results": [
            {
                "face_id": str(row.face_id),
                "photo_url": f"/api/v1/photo/{row.face_id}",   # ⭐ rename to photo_url
                "cosine_similarity": float(row.cosine),
                "centroid_similarity": float(row.cos_centroid),
                "identity_id": str(row.identity_id),
                "group": (
                    "high_confidence"
                    if row.cos_centroid >= 0.55
                    else "borderline"
                ),
            }
            for _, row in final_df.iterrows()
        ],

    }


@app.get("/api/v1/stats")
async def get_stats():
    now = datetime.utcnow()
    cutoff_30 = now - timedelta(days=30)

    recent = [x for x in SEARCH_LOG if x["ts"] >= cutoff_30]

    total_queries = len(recent)

    # avoid division errors
    avg_precision = (
        sum(x["precision"] for x in recent) / total_queries
        if total_queries else 0.0
    )

    ambiguous = [
        x for x in recent
        if x["status"] in ("ambiguous", "gray_zone")
    ]

    ambiguous_rate = (
        len(ambiguous) / total_queries * 100
        if total_queries else 0.0
    )

    new_identities = len(set(x["identity"] for x in recent))

    return dict(
        total_queries=total_queries,
        avg_precision=avg_precision,
        ambiguous_rate=ambiguous_rate,
        new_identities=new_identities
    )

@app.get("/api/v1/recent-searches")
async def get_recent_searches():
    return list(RECENT_SEARCHES)
