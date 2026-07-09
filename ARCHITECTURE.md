# FaceVault Architecture

## Components

```
pipeline/  (offline, torch)            Backend/  (online API)              Frontend/ (React SPA)
─────────────────────────────          ─────────────────────────           ────────────────────
extract_faces  → face crops + metadata main.py    FastAPI routes           upload → detect →
embed_faces    → 512-D embeddings      logic.py   pure decision rules      select faces →
build_indexes  → centroid FAISS index  config.py  FACEVAULT_* env settings search → grouped
evaluate       → held-out eval report  db.py      SQLite (logs, feedback)  results + HITL
     each stage writes a manifest      models/    vendored, hash-pinned    corrections
     (params, input/output hashes)     data/      pipeline outputs
```

## Query path

1. Client uploads image → `/detect-faces` (MTCNN) → user selects bounding boxes.
2. `/search` crops exactly the selected boxes, embeds them in one batched forward
   pass (InceptionResnetV1, VGGFace2 weights).
3. **Routing:** query vector vs identity-centroid FAISS index → similarity + margin →
   `accepted / ambiguous / gray_zone / new_identity` (`logic.route_status`).
4. **Identity-scoped retrieval:** brute-force cosine (numpy matmul) over only the routed
   identity's rows, with recursive centroid expansion (drift measured and flagged).
5. **Final filter:** adaptive centroid-similarity threshold (`logic.choose_threshold`);
   results grouped high-confidence / borderline; `strong_match_ratio` reported.
6. **HITL overlay:** human-rejected faces excluded, promoted faces up-grouped.
   Corrections persist in SQLite and replay at startup.

## Deliberate design choices

- **Identity-scoped brute force, not a global ANN index.** At ≤1k faces per identity a
  numpy matmul beats FAISS overhead and is exact. FAISS is used where it pays off: the
  480-row identity-centroid routing index.
- **Route-then-scope** bounds the false-positive surface: retrieval can never return a
  face from an identity that routing did not choose. Routing errors surface as flags,
  not as silently mixed results.
- **Local-first:** no runtime SaaS dependencies. Model weights are vendored and
  SHA-256-pinned; inference is local; storage is SQLite + numpy files.
- **Refuse-over-guess:** every uncertain stage (routing margin, cluster quality,
  centroid drift, empty filters) emits an explicit flag that the UI must display.

## State

| State | Where | Survives restart | Multi-process safe |
|---|---|---|---|
| Embeddings / metadata / indexes | numpy / CSV / FAISS files, loaded to RAM | yes (read-only) | yes (read-only) |
| Search log, stats | SQLite `data/facevault.db` | yes | yes |
| HITL feedback | SQLite (replayed into in-RAM sets at startup) | yes | writes yes; in-RAM overlay is per-process (single-worker deployment assumed) |
| Rate-limit buckets | in-RAM | no (by design) | per-process |

## Scale path (triggers → moves)

| Trigger | Move | Cost |
|---|---|---|
| >2–3M faces / RAM pressure | `np.load(..., mmap_mode="r")` for embeddings | ~1 line |
| >100k faces in a single identity | per-identity HNSW/IVF index | days |
| >1 uvicorn worker | move HITL overlay reads to SQLite per-request or add a pub/sub invalidation | 1–2 days |
| Multi-node / multi-tenant | Qdrant/Milvus for vectors + Postgres for metadata; route→scope→filter algorithm ports unchanged | weeks |
| GPU available | same code — device auto-detected; ONNX Runtime is the planned CPU/GPU serving path | config |

## Known limitations (tracked, deliberate)

- Single-worker assumption for the in-RAM feedback overlay (see table above).
- Thresholds are global, tuned on VGGFace2; per-identity calibration is planned once
  enough HITL feedback accumulates.
- Identity enrollment/deletion (index lifecycle) is designed but not yet implemented;
  see `take_step_forward.md` for the full roadmap.
