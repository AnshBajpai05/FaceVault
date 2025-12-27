
# FaceVault — Phase 3: Identity Retrieval Engine

This dataset contains the core search artifacts required to perform
high-accuracy face identity retrieval using FaceNet embeddings and FAISS.

## Contents

| File | Description |
|------|-------------|
| `face_embeddings.npy` | 187,697 × 512 normalized embeddings |
| `face_embedding_index.csv` | Row-aligned `face_id` mapping |
| `face_metadata.csv` | Metadata including identity + file paths |
| `facevault_faiss.index` | Saved FAISS IP index for fast search |
| `phase3_eval_results_10k.csv` | Benchmark of 10,000 random identity queries |

## Model Details

- Embedding model: **InceptionResnetV1 (VGGFace2 pretrained)**
- Embedding dim: **512**
- Normalization: **L2**
- Similarity metric: **cosine / inner product**

## Phase-3 Retrieval Performance (10,000-query evaluation)

| Metric | Value |
|--------|-------|
| Mean precision | **0.846** |
| Median precision | **0.952** |
| Min precision | 0.001 |
| Max precision | 1.000 |
| Avg retrieved / query | ~394 images |

The system includes:
- **adaptive thresholding based on centroid strength**
- **two-stage expansion (strong+weak matches)**
- **identity-vote confidence checks**
- **failure / unreliability flags**

This ensures **stable precision while retaining high recall**.

## Intended Use

These artifacts enable:
- Fast identity lookup
- Cluster refinement (Phase-4)
- Face-search UI / backend
- Research & benchmarking

## Citation

Based on the public VGGFace2 dataset.
