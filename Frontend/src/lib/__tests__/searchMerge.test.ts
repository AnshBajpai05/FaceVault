import { describe, it, expect } from 'vitest';
import { isValidResponse, mergeResponses } from '../searchMerge';
import { SearchResponse, SearchResult } from '@/types/facevault';

function makeResult(faceId: string, cosine = 0.7): SearchResult {
  return {
    face_id: faceId,
    photo_url: `/api/v1/photo/${faceId}`,
    cosine_similarity: cosine,
    centroid_similarity: cosine,
    identity_id: 'n000001',
    group: 'high_confidence',
  };
}

function makeResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    query_id: 'q1',
    faces_detected: 1,
    routing: {
      identity_id: 'n000001',
      status: 'accepted',
      similarity: 0.8,
      margin: 0.1,
    },
    cluster: {
      centroid_similarity: 0.75,
      threshold_used: 0.5,
      precision_estimate: 0.95,
      flagged_unreliable: false,
      flags: [],
    },
    results: [makeResult('f1')],
    ...overrides,
  };
}

describe('isValidResponse', () => {
  it('accepts a well-formed response', () => {
    expect(isValidResponse(makeResponse())).toBe(true);
  });

  it('accepts a new_identity response with null cluster and empty results', () => {
    expect(
      isValidResponse(
        makeResponse({
          cluster: null,
          results: [],
          routing: { identity_id: null, status: 'new_identity', similarity: 0.2, margin: 0 },
        })
      )
    ).toBe(true);
  });

  it('rejects null, primitives, and malformed objects', () => {
    expect(isValidResponse(null)).toBe(false);
    expect(isValidResponse(undefined)).toBe(false);
    expect(isValidResponse('accepted')).toBe(false);
    expect(isValidResponse({})).toBe(false);
    expect(isValidResponse({ routing: {} })).toBe(false); // no results array
    expect(isValidResponse({ results: [] })).toBe(false); // no routing
  });
});

describe('mergeResponses', () => {
  it('returns a single response unchanged', () => {
    const single = makeResponse();
    expect(mergeResponses([single])).toBe(single);
  });

  it('deduplicates results by face_id', () => {
    const a = makeResponse({ results: [makeResult('f1'), makeResult('f2')] });
    const b = makeResponse({ query_id: 'q2', results: [makeResult('f2'), makeResult('f3')] });

    const merged = mergeResponses([a, b]);
    expect(merged.results.map((r) => r.face_id)).toEqual(['f1', 'f2', 'f3']);
  });

  it('uses the routing summary from the strongest query face', () => {
    const weak = makeResponse({
      routing: { identity_id: 'n000001', status: 'gray_zone', similarity: 0.52, margin: 0.01 },
    });
    const strong = makeResponse({
      query_id: 'q2',
      routing: { identity_id: 'n000002', status: 'accepted', similarity: 0.91, margin: 0.2 },
    });

    const merged = mergeResponses([weak, strong]);
    expect(merged.routing.identity_id).toBe('n000002');
    expect(merged.routing.status).toBe('accepted');
    expect(merged.query_id).toBe('q2');
  });

  it('flags the merged view and keeps a per-face breakdown', () => {
    const a = makeResponse();
    const b = makeResponse({
      query_id: 'q2',
      routing: { identity_id: 'n000002', status: 'ambiguous', similarity: 0.6, margin: 0.02 },
      results: [],
    });

    const merged = mergeResponses([a, b]);
    expect(merged.cluster?.flags).toContain('multi_face_query');
    expect(merged.faces_detected).toBe(2);
    expect(merged.per_face).toHaveLength(2);
    expect(merged.per_face?.[1]).toEqual({
      status: 'ambiguous',
      identity_id: 'n000002',
      similarity: 0.6,
      matches: 0,
    });
  });

  it('keeps cluster null when the strongest face has no cluster', () => {
    const noMatch = makeResponse({
      cluster: null,
      results: [],
      routing: { identity_id: null, status: 'new_identity', similarity: 0.9, margin: 0 },
    });
    const weaker = makeResponse({
      routing: { identity_id: 'n000001', status: 'accepted', similarity: 0.3, margin: 0.1 },
    });

    const merged = mergeResponses([noMatch, weaker]);
    expect(merged.cluster).toBeNull();
  });
});
