// =========================
// FaceVault API Config
// =========================

import { DetectedFace, SearchResponse, SearchState } from "@/types/facevault";

export const API_ROOT =
  (import.meta.env.VITE_API_URL?.replace(/\/api\/v1\/?$/, "")) ||
  import.meta.env.VITE_API_ROOT ||
  "http://127.0.0.1:8000";

export const API_BASE = `${API_ROOT}/api/v1`;

/**
 * Detect faces in a given image
 */
export async function detectFaces(file: File): Promise<DetectedFace[]> {
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch(`${API_BASE}/detect-faces`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error(`Face detection failed (HTTP ${res.status})`);
  return await res.json();
}

/**
 * Query telemetry broadcast to the TelemetryPanel.
 * All values are measured — nothing is fabricated. `backendMs` comes from the
 * server's X-Process-Time header and is omitted if the header is missing.
 */
export interface TelemetryMetrics {
  queryType: string;
  facesSearched: number;
  networkRtt: number;
  backendMs?: number;
  /** Measured FAISS routing + retrieval time reported by the backend */
  searchMs?: number;
  timestamp: number;
}

export const publishTelemetry = (metrics: TelemetryMetrics) => {
  const event = new CustomEvent("facevault-telemetry", { detail: metrics });
  window.dispatchEvent(event);
};

/**
 * Search one or more selected faces.
 * Sends the bounding boxes of the faces the user selected so the backend
 * searches exactly those faces (not just the most confident detection).
 * Returns a single SearchResponse for one face, or an array for several.
 */
export async function searchIdentities(
  file: File,
  selectedBoxes: DetectedFace["boundingBox"][],
  setSearchState: (s: SearchState) => void,
  logQuery: boolean = true
): Promise<SearchResponse | SearchResponse[]> {
  const formData = new FormData();
  formData.append("image", file);
  if (selectedBoxes.length > 0) {
    formData.append("boxes", JSON.stringify(selectedBoxes));
  }
  // Privacy toggle: false = backend runs the search without logging it
  formData.append("log_query", String(logQuery));

  try {
    setSearchState({
      step: "searching",
      progress: 20,
      message: `Searching ${selectedBoxes.length || 1} face(s)…`,
    });

    const startMark = performance.now();

    const res = await fetch(`${API_BASE}/search`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.json())?.detail ?? "";
      } catch {
        /* non-JSON error body */
      }
      throw new Error(
        detail === "no_face_detected"
          ? "No face could be found in the selected region."
          : `Search failed (HTTP ${res.status})`
      );
    }

    setSearchState({
      step: "filtering",
      progress: 70,
      message: "Applying centroid-similarity filtering…",
    });

    const networkRtt = performance.now() - startMark;
    const backendHeader = res.headers.get("X-Process-Time");
    const backendMs = backendHeader
      ? parseFloat(backendHeader) * 1000
      : undefined;

    const data = await res.json();

    // Sum of measured per-face vector search times, if the backend sent them
    const responses: SearchResponse[] = Array.isArray(data) ? data : [data];
    const searchTimes = responses
      .map((r) => r?.timings?.search_ms)
      .filter((t): t is number => typeof t === "number");
    const searchMs =
      searchTimes.length > 0
        ? searchTimes.reduce((a, b) => a + b, 0)
        : undefined;

    publishTelemetry({
      queryType: selectedBoxes.length > 1 ? "Multi-Face Query" : "Identity Query",
      facesSearched: selectedBoxes.length || 1,
      networkRtt,
      backendMs,
      searchMs,
      timestamp: Date.now(),
    });

    setSearchState({
      step: "complete",
      progress: 100,
      message: "Search complete",
    });

    return data;
  } catch (e) {
    setSearchState({
      step: "error",
      progress: 0,
      message: e instanceof Error ? e.message : "Search failed",
    });
    throw e;
  }
}

export async function getRecentSearches() {
  const res = await fetch(`${API_BASE}/recent-searches`);
  if (!res.ok) throw new Error("Failed to load recent searches");
  return await res.json();
}
