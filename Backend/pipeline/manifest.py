"""Manifests: make every pipeline artifact traceable to code + inputs."""

import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone


def file_sha256(path, max_bytes=None):
    """SHA-256 of a file; for very large files pass max_bytes to hash a prefix
    (recorded as such in the manifest)."""
    h = hashlib.sha256()
    read = 0
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
            read += len(chunk)
            if max_bytes and read >= max_bytes:
                return f"prefix{max_bytes}:{h.hexdigest()}"
    return h.hexdigest()


def _git_commit():
    try:
        return (
            subprocess.check_output(
                ["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL
            )
            .decode()
            .strip()
        )
    except Exception:
        return "unknown"


def write_manifest(out_dir, stage, params, inputs=(), outputs=()):
    """Write manifest_<stage>.json describing one pipeline run.

    inputs/outputs: iterables of file paths; each is hashed (large files by
    64MB prefix to keep runs fast).
    """
    manifest = {
        "stage": stage,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "git_commit": _git_commit(),
        "params": params,
        "inputs": {
            p: file_sha256(p, max_bytes=64 << 20) for p in inputs if os.path.exists(p)
        },
        "outputs": {
            p: file_sha256(p, max_bytes=64 << 20) for p in outputs if os.path.exists(p)
        },
    }
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"manifest_{stage}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    return path
