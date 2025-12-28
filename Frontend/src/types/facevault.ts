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

export interface RoutingInfo {
  identity_id: string;
  status: 'accepted' | 'ambiguous' | 'low_confidence' | 'no_match';
  similarity: number;
  margin: number;
}

export interface ClusterInfo {
  centroid_similarity: number;
  threshold_used: number;
  precision_estimate: number;
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


export interface SearchResponse {
  query_id: string;
  faces_detected: number;
  routing: RoutingInfo;
  cluster: ClusterInfo;
  results: SearchResult[];
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
