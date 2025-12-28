import { useState, useCallback } from 'react';
import { 
  DetectedFace, 
  SearchResponse, 
  SearchState, 
  DeveloperSettings 
} from '@/types/facevault';
import { detectFaces, searchIdentity } from '@/lib/api';

export function useFaceVault() {
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  const [selectedFace, setSelectedFace] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<SearchState>({
    step: 'idle',
    progress: 0,
    message: '',
  });
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [saveQuery, setSaveQuery] = useState(false);
  const [developerSettings, setDeveloperSettings] = useState<DeveloperSettings>({
    showSimilarityValues: false,
    showRoutingCandidates: false,
    showRejectedResults: false,
    similarityThreshold: 0.48,
  });

  const handleImageUpload = useCallback(async (file: File) => {
    setUploadedImage(file);
    setImagePreview(URL.createObjectURL(file));
    setSearchResults(null);
    setSelectedFace(null);
    
    // Auto-detect faces
    const faces = await detectFaces(file);
    setDetectedFaces(faces);
    
    // Auto-select if only one face
    if (faces.length === 1) {
      setSelectedFace(faces[0].id);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    if (!uploadedImage || !selectedFace) return;

    setSearchState({ step: 'detecting', progress: 0, message: 'Starting search...' });
    
    try {
      const results = await searchIdentity(uploadedImage, selectedFace, setSearchState);
      setSearchResults(results);
    } catch (error) {
      setSearchState({ 
        step: 'error', 
        progress: 0, 
        message: 'Search failed. Please try again.' 
      });
    }
  }, [uploadedImage, selectedFace]);

  const resetSearch = useCallback(() => {
    setUploadedImage(null);
    setImagePreview(null);
    setDetectedFaces([]);
    setSelectedFace(null);
    setSearchState({ step: 'idle', progress: 0, message: '' });
    setSearchResults(null);
  }, []);

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
    selectedFace,
    searchState,
    searchResults,
    saveQuery,
    developerSettings,
    
    // Actions
    handleImageUpload,
    handleSearch,
    resetSearch,
    setSelectedFace,
    setSaveQuery,
    updateDeveloperSetting,
  };
}
