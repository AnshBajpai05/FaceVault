"""Central runtime configuration for the FaceVault backend.

Every tunable lives here and can be overridden with a FACEVAULT_* environment
variable, so deployments never require editing source. The effective settings
are logged at startup so each run records its own configuration.
"""

import os
from dataclasses import dataclass, field, fields


def _env_str(name, default):
    return os.getenv(name, default)


def _env_int(name, default):
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _env_float(name, default):
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class Settings:
    # ---- Paths ----
    data_dir: str = field(default_factory=lambda: _env_str("FACEVAULT_DATA_DIR", "data"))
    weights_path: str = field(
        default_factory=lambda: _env_str(
            "FACEVAULT_WEIGHTS_PATH", os.path.join("models", "vggface2.pt")
        )
    )
    # SHA-256 of the pinned InceptionResnetV1 (VGGFace2) weights file.
    # Empty string disables verification (not recommended outside dev).
    weights_sha256: str = field(
        default_factory=lambda: _env_str("FACEVAULT_WEIGHTS_SHA256", "")
    )

    # ---- API / security ----
    cors_origins: str = field(
        default_factory=lambda: _env_str(
            "FACEVAULT_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,"
            "http://localhost:8080,http://127.0.0.1:8080",
        )
    )
    # If set, expensive/mutating endpoints require this value in X-API-Key.
    # Empty = auth disabled (local development default).
    api_key: str = field(default_factory=lambda: _env_str("FACEVAULT_API_KEY", ""))
    # Sliding-window rate limit for inference endpoints, per client IP.
    rate_limit_per_minute: int = field(
        default_factory=lambda: _env_int("FACEVAULT_RATE_LIMIT_PER_MINUTE", 30)
    )
    # Upload guards
    max_upload_bytes: int = field(
        default_factory=lambda: _env_int("FACEVAULT_MAX_UPLOAD_MB", 15) * 1024 * 1024
    )
    max_image_pixels: int = field(
        default_factory=lambda: _env_int("FACEVAULT_MAX_IMAGE_MP", 25) * 1_000_000
    )

    # ---- Retrieval ----
    top_k_identities: int = field(default_factory=lambda: _env_int("FACEVAULT_TOP_K_ID", 5))
    top_k_results: int = field(default_factory=lambda: _env_int("FACEVAULT_TOP_K", 800))
    max_expansion_iters: int = field(default_factory=lambda: _env_int("FACEVAULT_MAX_ITERS", 3))

    # ---- Routing thresholds (genuine-FNMR vs impostor-rejection trade-off;
    # sweep with: python -m pipeline.sweep_thresholds) ----
    min_accept: float = field(default_factory=lambda: _env_float("FACEVAULT_MIN_ACCEPT", 0.62))
    min_gray: float = field(default_factory=lambda: _env_float("FACEVAULT_MIN_GRAY", 0.58))
    min_retry: float = field(default_factory=lambda: _env_float("FACEVAULT_MIN_RETRY", 0.56))
    margin_req: float = field(default_factory=lambda: _env_float("FACEVAULT_MARGIN_REQ", 0.08))

    def origins_list(self):
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def summary(self):
        """Loggable summary; secrets are masked."""
        out = {}
        for f in fields(self):
            v = getattr(self, f.name)
            if f.name == "api_key":
                v = "<set>" if v else "<disabled>"
            out[f.name] = v
        return out


settings = Settings()
