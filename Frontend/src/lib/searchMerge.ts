import { SearchResponse } from '@/types/facevault';

/**
 * Shape validation for backend search responses. Anything that fails this
 * check is rejected loudly — a malformed response must never be dressed up
 * as a confident match.
 */
export function isValidResponse(r: unknown): r is SearchResponse {
  if (!r || typeof r !== 'object') return false;
  const resp = r as SearchResponse;
  return !!resp.routing && Array.isArray(resp.results);
}

/**
 * Merge per-face responses from a multi-face query into one view.
 *
 * - Results are deduplicated by face_id (first occurrence wins).
 * - The headline routing/cluster summary comes from the query face with the
 *   strongest routing similarity.
 * - A `multi_face_query` flag is added so the UI can say this is a merged
 *   view, and `per_face` keeps an honest per-query-face breakdown.
 */
export function mergeResponses(responses: SearchResponse[]): SearchResponse {
  if (responses.length === 1) return responses[0];

  const best = responses.reduce((a, b) =>
    (b.routing.similarity ?? 0) > (a.routing.similarity ?? 0) ? b : a
  );

  const seen = new Set<string>();
  const results = responses
    .flatMap((r) => r.results)
    .filter((r) => {
      if (seen.has(r.face_id)) return false;
      seen.add(r.face_id);
      return true;
    });

  return {
    query_id: best.query_id,
    faces_detected: responses.length,
    routing: best.routing,
    cluster: best.cluster
      ? { ...best.cluster, flags: [...best.cluster.flags, 'multi_face_query'] }
      : null,
    results,
    timings: best.timings,
    per_face: responses.map((r) => ({
      status: r.routing.status,
      identity_id: r.routing.identity_id,
      similarity: r.routing.similarity,
      matches: r.results.length,
    })),
  };
}
