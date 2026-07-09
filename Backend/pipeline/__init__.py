"""FaceVault offline pipeline: extract -> embed -> index -> evaluate.

Each stage is an idempotent CLI (`python -m pipeline.<stage> --help`) that
writes a manifest (parameters, code version, input/output hashes) next to its
outputs, so every artifact in data/ is traceable to the code and inputs that
produced it.
"""
