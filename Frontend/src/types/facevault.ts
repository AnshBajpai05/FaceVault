// FaceVault Type Definitions

export interface DetectedFace {
  id: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

// Routing statuses exactly as the backend emits them (Phase-4 pipeline)
export type RoutingStatus = 'accepted' | 'ambiguous' | 'gray_zone' | 'new_identity';

export interface RoutingInfo {
  identity_id: string | null;
  status: RoutingStatus;
  similarity: number;
  margin: number;
  best_sim?: number;
  second_sim?: number;
}

export interface ClusterInfo {
  centroid_similarity: number;
  threshold_used: number;
  /** Share of surviving results with high centroid similarity — the honest
   * runtime confidence signal (identity-scoped precision would be 1.0 by
   * construction, so the backend no longer reports it). */
  strong_match_ratio: number;
  /** Total centroid displacement during recursive expansion; high values mean
   * weak matches pulled the cluster. */
  centroid_drift?: number;
  flagged_unreliable: boolean;
  flags: string[];
}

export interface SearchResult {
  face_id: string;
  photo_url: string;   // <-- backend sends this
  cosine_similarity: number;
  centroid_similarity: number;
  identity_id: string;
  group: 'high_confidence' | 'borderline' | 'rejected';
}

export interface SearchTimings {
  search_ms: number;
}

/** One-line summary per query face in a multi-face search */
export interface PerFaceSummary {
  status: RoutingStatus;
  identity_id: string | null;
  similarity: number;
  matches: number;
}

export interface SearchResponse {
  query_id: string;
  faces_detected: number;
  routing: RoutingInfo;
  cluster: ClusterInfo | null; // null when routing status is new_identity
  results: SearchResult[];
  timings?: SearchTimings;
  /** Present after merging a multi-face query (client-side) */
  per_face?: PerFaceSummary[];
}

export type SearchStep =
  | 'idle'
  | 'detecting'
  | 'computing'
  | 'routing'
  | 'searching'
  | 'filtering'
  | 'preparing'
  | 'complete'
  | 'error';

export interface SearchState {
  step: SearchStep;
  progress: number;
  message: string;
}

export interface DeveloperSettings {
  showSimilarityValues: boolean;
  showRoutingCandidates: boolean;
  showRejectedResults: boolean;
  similarityThreshold: number;
}
