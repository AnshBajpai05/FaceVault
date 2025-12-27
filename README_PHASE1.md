
# 🏗️ FaceVault — Phase-1: Face Instance Extraction & Structured Metadata Pipeline

Phase-1 establishes the foundation of the FaceVault system by converting raw images
into a **clean, structured, multi-face-aware dataset** consisting of:

✔ detected face crops  
✔ bounding-box metadata  
✔ stable identity links (where available)  
✔ ArcFace-style embeddings  
✔ index mapping for retrieval  

This phase ensures that every detected face becomes a **searchable object** —
independent of the original image.

---

## 📦 Contents

| File | Description |
|------|-------------|
| `face_metadata.csv` | One row per detected face instance |
| `face_embeddings.npy` | L2-normalized 512-D embeddings (N × 512) |
| `face_embedding_index.csv` | Mapping: `face_id → embedding_row` |
| `README_PHASE1.md` | This document |

---

## 🧠 Phase-1 Processing Workflow

### 1️⃣ Face Detection (MTCNN)

Every image is processed using **MTCNN**, which detects:

- every visible face  
- its bounding-box location  
- detection confidence  

This supports **multi-face images naturally**  
(e.g., classroom photos, CCTV frames, group images).

---

### 2️⃣ Face Cropping & Normalization

For each detected face:

- the bounding region is cropped  
- resized for the embedding model  
- converted to RGB  
- normalized  

Each crop becomes a **first-class dataset record** — we call this a **Face Instance**.

---

### 3️⃣ Metadata Entry Created (`face_metadata.csv`)

For every detected face, we store:

| Field | Description |
|------|-------------|
| `face_id` | unique ID for this face instance |
| `image_id` | source image identifier |
| `identity_id` | labeled person ID (if available) |
| `bbox_x1,y1,x2,y2` | bounding-box coordinates |
| `detector_score` | MTCNN confidence |
| `crop_path` | path to saved crop |
| `timestamp` | optional — capture/import time |
| `source` | optional — dataset / camera / upload |

This table becomes the **ground-truth registry of all Face Instances**.

It supports:

✔ 🧑‍🤝‍🧑 multi-face images  
✔ 🔍 trace-back to original images  
✔ 🧪 dataset splits  
✔ 📦 incremental ingestion  

---

### 4️⃣ Embedding Generation

Each face crop is passed through:

- **Backbone:** InceptionResnetV1 (VGGFace2 pretrained)  
- **Embedding dimension:** 512  
- **Normalization:** L2  
- **Similarity metric:** Cosine  

The resulting matrix is stored as:

`face_embeddings.npy` (shape: N × 512)

where **N = number of face instances**.

---

### 5️⃣ Index Mapping (`face_embedding_index.csv`)

Because embeddings are stored in a matrix, we maintain a **stable lookup table**:

| face_id | embedding_row |
|--------|----------------|
| f_000001 | 0 |
| f_000002 | 1 |
| ... | ... |

This guarantees:

✔ constant-time lookup  
✔ reproducible embedding access  
✔ FAISS compatibility  
✔ safe dataset updates  

---

## 🌍 Why This Dataset Structure Matters

Real-world university systems must handle:

✔ multiple faces in the same photo  
✔ CCTV / classroom cameras  
✔ student uploads  
✔ incremental enrollment  

So FaceVault uses a **three-level relational structure**:

| Level | Meaning | Example |
|------|--------|--------|
| **Identity** | the person | Student #4213 |
| **Image** | uploaded photo | `event_day1.jpg` |
| **Face Instance** | one detected face in that photo | bounding box #2 |

This aligns perfectly with later phases:

- Phase-3 — similarity-based retrieval  
- Phase-4 — identity-scoped routing  
- Phase-6 — production UI + API  

---

## 🧪 Data Quality Controls

During ingestion:

- low-confidence detections are filtered  
- bounding-box sanity checks applied  
- metadata rows are always written atomically  

Result: a **clean, ML-ready dataset**.

---

## 🏫 University-Scale Usage Example

When a university ingests photos:

📥 Raw image  
→ detect faces  
→ generate crops  
→ embed  
→ assign `face_id`  
→ optionally map to `identity_id`

Unknown people remain unlabeled — but still searchable — because they already have:
`face_id`, `embedding`, `metadata`, `timestamp`.

This supports:

✔ attendance  
✔ access control  
✔ event archive search  
✔ safety + incident review  
✔ alumni lookup  

---

## ⚠️ Known Limitations

- extreme pose / blur may reduce detection quality  
- unlabeled identities require later assignment  
- detector thresholds must balance recall + noise  

These are mitigated in later phases with **routing, calibration, and reliability scoring**.

---

## 📚 Model Details

- Detector: **MTCNN**
- Backbone: **InceptionResnetV1 (VGGFace2 pretrained)**
- Embedding dim: **512**
- Normalization: **L2**
- Metric: **Cosine similarity**

---

## 🏁 Summary

Phase-1 converts raw images into a **structured, multi-face-aware identity dataset** containing:

✔ clean face crops  
✔ rich metadata  
✔ normalized embeddings  
✔ stable lookup indices  

This dataset becomes the **core backbone of FaceVault**, enabling:

🔍 scalable face search  
🧠 identity learning  
🛡️ precision-first recognition  
🏢 real-world deployment readiness  
