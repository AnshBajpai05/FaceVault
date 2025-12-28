// =========================
// FaceVault API Config
// =========================

// 🟢 API_ROOT = server ONLY (no /api/v1)
// It will automatically strip /api/v1 if someone set it wrong
export const API_ROOT =
  (import.meta.env.VITE_API_URL?.replace(/\/api\/v1\/?$/, "")) ||
  import.meta.env.VITE_API_ROOT ||
  "http://127.0.0.1:8000";

// 🟣 API_BASE = server + /api/v1
export const API_BASE = `${API_ROOT}/api/v1`;


// =========================
// Types
// =========================
import { DetectedFace } from "@/types/facevault";


// =========================
// Detect Faces
// =========================
export async function detectFaces(file: File): Promise<DetectedFace[]> {
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch(`${API_BASE}/detect-faces`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Face detection failed");
  return await res.json();
}


// =========================
// Search Identity
// =========================
export async function searchIdentity(
  file: File,
  selectedFaceId: string,
  setSearchState: (s: any) => void
) {
  const formData = new FormData();
  formData.append("image", file);

  try {
    setSearchState({
      step: "uploading",
      progress: 20,
      message: "Uploading image…",
    });

    const res = await fetch(`${API_BASE}/search`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error("Search failed");

    setSearchState({
      step: "processing",
      progress: 60,
      message: "Processing results…",
    });

    const data = await res.json();

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
      message: "Search failed",
    });
    throw e;
  }
}

export async function getRecentSearches() {
  const res = await fetch(`${API_BASE}/recent-searches`);
  if (!res.ok) throw new Error("Failed to load recent searches");
  return await res.json();
}
