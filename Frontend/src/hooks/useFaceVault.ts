import { useState, useCallback, useEffect, useRef } from 'react';
import {
  DetectedFace,
  SearchResponse,
  SearchState,
  DeveloperSettings,
} from '@/types/facevault';
import { detectFaces, searchIdentities } from '@/lib/api';
import { logAuditAction } from '@/lib/audit';
import { isValidResponse, mergeResponses } from '@/lib/searchMerge';

const STORAGE_KEY = 'facevault_session';
// Cap what we persist so large result sets don't blow the ~5MB quota.
const MAX_PERSISTED_RESULTS = 150;

export function useFaceVault() {
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  const [selectedFaces, setSelectedFaces] = useState<string[]>([]);

  const [searchState, setSearchState] = useState<SearchState>({
    step: 'idle',
    progress: 0,
    message: '',
  });
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [saveQuery, setSaveQuery] = useState(true);
  const [developerSettings, setDeveloperSettings] = useState<DeveloperSettings>({
    showSimilarityValues: false,
    showRoutingCandidates: false,
    showRejectedResults: false,
    similarityThreshold: 0.48,
  });

  const previewUrlRef = useRef<string | null>(null);

  const releasePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  // Load state from localStorage on initial mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isValidResponse(parsed.searchResults)) {
          setSearchResults(parsed.searchResults);
          setSearchState({ step: 'complete', progress: 100, message: 'Restored from session' });
        }
        if (parsed.developerSettings) {
          setDeveloperSettings(parsed.developerSettings);
        }
      }
    } catch (e) {
      console.error('Failed to load session from local storage', e);
    }
  }, []);

  // Persist session (results trimmed to stay within storage quota)
  useEffect(() => {
    try {
      const stateToSave = {
        searchResults: searchResults
          ? { ...searchResults, results: searchResults.results.slice(0, MAX_PERSISTED_RESULTS) }
          : null,
        developerSettings,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.error('Failed to save session to local storage', e);
    }
  }, [searchResults, developerSettings]);

  useEffect(() => releasePreviewUrl, [releasePreviewUrl]);

  const handleImageUpload = useCallback(async (file: File) => {
    releasePreviewUrl();
    const previewUrl = URL.createObjectURL(file);
    previewUrlRef.current = previewUrl;

    setUploadedImage(file);
    setImagePreview(previewUrl);
    setSearchResults(null);
    setSelectedFaces([]);
    setDetectedFaces([]);
    setSearchState({ step: 'idle', progress: 0, message: '' });

    try {
      const faces = await detectFaces(file);
      setDetectedFaces(faces);

      // Auto-select if only one face
      if (faces.length === 1) {
        setSelectedFaces([faces[0].id]);
      }
    } catch (error) {
      setSearchState({
        step: 'error',
        progress: 0,
        message:
          error instanceof Error
            ? error.message
            : 'Face detection failed — is the backend running?',
      });
    }
  }, [releasePreviewUrl]);

  const handleSearch = useCallback(async () => {
    if (!uploadedImage || selectedFaces.length === 0) return;

    const boxes = detectedFaces
      .filter((f) => selectedFaces.includes(f.id))
      .map((f) => f.boundingBox);

    setSearchState({ step: 'searching', progress: 0, message: 'Starting search…' });

    try {
      const raw = await searchIdentities(uploadedImage, boxes, setSearchState, saveQuery);

      let response: SearchResponse;
      if (Array.isArray(raw)) {
        const valid = raw.filter(isValidResponse);
        if (valid.length === 0) {
          throw new Error('Backend returned no usable results.');
        }
        response = mergeResponses(valid);
      } else if (isValidResponse(raw)) {
        response = raw;
      } else {
        // Fail loudly — never dress a malformed response up as a confident match.
        throw new Error('Unexpected backend response format.');
      }

      logAuditAction(
        'search',
        `Searched ${boxes.length} face(s) — status: ${response.routing.status}, ${response.results.length} matches`
      );

      setSearchResults(response);
    } catch (error) {
      setSearchState({
        step: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Search failed.',
      });
    }
  }, [uploadedImage, selectedFaces, detectedFaces, saveQuery]);

  const resetSearch = useCallback(() => {
    releasePreviewUrl();
    setUploadedImage(null);
    setImagePreview(null);
    setDetectedFaces([]);
    setSelectedFaces([]);
    setSearchState({ step: 'idle', progress: 0, message: '' });
    setSearchResults(null);
    localStorage.removeItem(STORAGE_KEY); // Clear session
  }, [releasePreviewUrl]);

  const updateDeveloperSetting = useCallback(<K extends keyof DeveloperSettings>(
    key: K,
    value: DeveloperSettings[K]
  ) => {
    setDeveloperSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  return {
    // State
    uploadedImage,
    imagePreview,
    detectedFaces,
    selectedFaces,
    searchState,
    searchResults,
    saveQuery,
    developerSettings,

    // Actions
    handleImageUpload,
    handleSearch,
    resetSearch,
    setSelectedFaces,
    setSaveQuery,
    updateDeveloperSetting,
  };
}
