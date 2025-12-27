# 🔐 FaceVault — Identity-Scoped Face Retrieval System

FaceVault is an **end-to-end face search pipeline** that converts raw images into
**searchable face instances**, builds **512-D embedding indexes**, and performs
**identity-scoped retrieval with reliability controls** to prevent silent
mis-identification.

The system is implemented as **modular phases**, each documented and benchmarked.
Every phase can be reproduced independently.

---

## 🎯 Core Intent — Simple & Honest

FaceVault is built for **precision-first identity retrieval** suitable for
large-scale institutional use such as:

* identity lookup
* archival search
* attendance / verification
* controlled-access environments

The design goal is:

> **Recover as many images of a person as possible — without ever silently returning the wrong person.**

So the pipeline integrates:

✔ FAISS vector search
✔ identity-level routing
✔ centroid-based filtering
✔ ambiguity / gray-zone flags
✔ large-scale evaluation & calibration

This turns raw images into a **trustworthy identity search backend** — not just a similarity demo.

---

## 📦 Project Phases

### ✅ **Phase-1 — Dataset Structuring & Face Extraction**

Raw images → **clean, queryable face dataset**

* Multi-face detection using **MTCNN**
* Each detected face assigned a unique **`face_id`**
* Bounding boxes, paths, & original identity stored in metadata
* Supports **multiple people per image**
* CSV-backed audit trail

📄 Details → `README_PHASE1.md`

---

### ✅ **Phase-2 — 512-D Embedding Backbone**

Each face crop → **L2-normalized 512-D embedding**

* Backbone: **InceptionResnetV1 (VGGFace2 pretrained)**
* Deterministic, resume-safe embedding pipeline
* Outputs:

  * `face_embeddings.npy`
  * `face_embedding_index.csv`

Includes **same-identity vs different-identity cosine validation** to prove embedding quality.

📄 Details → `README_PHASE2.md`

---

### ✅ **Phase-3 — Global Face Retrieval (FAISS)**

High-recall **cosine similarity search** across all faces:

* Global FAISS index
* Centroid-guided recursive expansion
* Adaptive similarity thresholds
* Weak-match rejection
* Precision stability controls

📄 Details → `README_PHASE3.md`

---

### ✅ **Phase-4 — Identity-Scoped Routing & Risk Control**

Queries are first routed to the **most likely identity centroid**.
Retrieval then runs **only within that identity’s pool**, followed by
**centroid-similarity filtering and explicit reliability flags**.

Evaluated at **~10,000 random queries**:

| Metric                  |     Value |
| ----------------------- | --------: |
| **Mean Precision**      | **0.946** |
| **Median Precision**    | **1.000** |
| **Mean Recall**         | **0.865** |
| **Avg Results / Query** |      ~385 |

This phase introduces **production-grade guardrails**, such as:

* ambiguous routing detection
* gray-zone similarity handling
* weak-cluster detection
* precision-risk alerts

📄 Details → `README_PHASE4.md`

---

## 🧪 Reproducibility & Engineering Discipline

Each phase publishes:

* FAISS indexes
* identity centroids
* evaluation logs
* calibration tables
* frozen config files

So **every result can be reproduced** — a core design principle.

---

## ⚠️ Responsible Use

This system is intended for **consented, policy-compliant environments only**, such as
fest photo dumps, campus identity systems or secured archives.

It must **not** be deployed for surveillance or non-consensual tracking.

---

## ⭐ Project Status

FaceVault currently implements a **precision-focused, identity-aware face retrieval engine**
with calibration, verification, and safety controls.

Next roadmap items include:

* UI / API layer (FastAPI + React/Streamlit)
* incremental index updates
* new-identity registration workflow
* human-in-the-loop review UX

---

## 📄 Phase Documentation Index

* `README_PHASE1.md`
* `README_PHASE2.md`
* `README_PHASE3.md`
* `README_PHASE4.md`

Each phase README contains **deep technical detail & evaluation**.
This root README keeps the *intent and scope simple and clear*.

---

