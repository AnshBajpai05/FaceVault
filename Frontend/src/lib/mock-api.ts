// Mock API for FaceVault - Replace with real API calls later
import { SearchResponse, DetectedFace, SearchState } from '@/types/facevault';

// Simulated delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock face detection
export async function detectFaces(imageFile: File): Promise<DetectedFace[]> {
  await delay(800);
  
  // Simulate detecting 1-3 faces randomly
  const numFaces = Math.floor(Math.random() * 3) + 1;
  
  return Array.from({ length: numFaces }, (_, i) => ({
    id: `face-${i + 1}`,
    boundingBox: {
      x: 0.2 + (i * 0.25),
      y: 0.15 + (Math.random() * 0.1),
      width: 0.2,
      height: 0.28,
    },
    confidence: 0.92 + (Math.random() * 0.07),
  }));
}

// Mock search with progress updates
export async function searchIdentity(
  imageFile: File,
  faceId: string,
  onProgress: (state: SearchState) => void
): Promise<SearchResponse> {
  const steps: Array<{ step: SearchState['step']; message: string; duration: number }> = [
    { step: 'detecting', message: 'Detecting face...', duration: 600 },
    { step: 'computing', message: 'Computing embedding...', duration: 800 },
    { step: 'routing', message: 'Routing to identity...', duration: 700 },
    { step: 'searching', message: 'Searching identity pool...', duration: 1200 },
    { step: 'filtering', message: 'Filtering results...', duration: 500 },
    { step: 'preparing', message: 'Preparing results...', duration: 400 },
  ];

  let progress = 0;
  const progressIncrement = 100 / steps.length;

  for (const { step, message, duration } of steps) {
    onProgress({ step, progress, message });
    await delay(duration);
    progress += progressIncrement;
  }

  onProgress({ step: 'complete', progress: 100, message: 'Search complete' });

  // Generate mock results
  const statuses = ['accepted', 'ambiguous', 'low_confidence', 'no_match'] as const;
  const status = statuses[Math.floor(Math.random() * 2)]; // Mostly accepted or ambiguous for demo

  const mockResults = generateMockResults(status);

  return {
    query_id: `query-${Date.now()}`,
    faces_detected: 1,
    routing: {
      identity_id: 'n000231',
      status,
      similarity: 0.75 + (Math.random() * 0.15),
      margin: 0.05 + (Math.random() * 0.05),
    },
    cluster: {
      centroid_similarity: 0.72 + (Math.random() * 0.12),
      threshold_used: 0.48,
      precision_estimate: status === 'accepted' ? 0.95 + (Math.random() * 0.04) : 0.65 + (Math.random() * 0.2),
      flagged_unreliable: status === 'low_confidence',
      flags: status === 'ambiguous' ? ['Multiple close identities detected'] : [],
    },
    results: mockResults,
  };
}

function generateMockResults(status: string) {
  const baseCount = status === 'accepted' ? 25 : status === 'ambiguous' ? 15 : 5;
  
  const results = [];
  
  // High confidence results
  const highCount = Math.floor(baseCount * 0.6);
  for (let i = 0; i < highCount; i++) {
    results.push({
      image_path: `https://images.unsplash.com/photo-${1500000000000 + i}?w=200&h=200&fit=crop&face`,
      cosine_similarity: 0.82 + (Math.random() * 0.12),
      centroid_similarity: 0.75 + (Math.random() * 0.15),
      identity_id: 'n000231',
      group: 'high_confidence' as const,
    });
  }

  // Borderline results
  const borderlineCount = Math.floor(baseCount * 0.3);
  for (let i = 0; i < borderlineCount; i++) {
    results.push({
      image_path: `https://images.unsplash.com/photo-${1500100000000 + i}?w=200&h=200&fit=crop&face`,
      cosine_similarity: 0.55 + (Math.random() * 0.15),
      centroid_similarity: 0.50 + (Math.random() * 0.15),
      identity_id: 'n000231',
      group: 'borderline' as const,
    });
  }

  // Rejected results (for developer mode)
  const rejectedCount = Math.floor(baseCount * 0.1);
  for (let i = 0; i < rejectedCount; i++) {
    results.push({
      image_path: `https://images.unsplash.com/photo-${1500200000000 + i}?w=200&h=200&fit=crop&face`,
      cosine_similarity: 0.35 + (Math.random() * 0.15),
      centroid_similarity: 0.30 + (Math.random() * 0.15),
      identity_id: `n000${232 + i}`,
      group: 'rejected' as const,
    });
  }

  return results;
}

// Export for API contract reference
export const API_ENDPOINT = '/api/v1/search';
