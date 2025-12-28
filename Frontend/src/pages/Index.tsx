import { Header } from '@/components/facevault/Header';
import { SearchPanel } from '@/components/facevault/SearchPanel';
import { SystemStats } from '@/components/facevault/SystemStats';
import { ReliabilityCard } from '@/components/facevault/ReliabilityCard';
import { RecentSearches } from '@/components/facevault/RecentSearches';
import { SearchProgress } from '@/components/facevault/SearchProgress';
import { SummaryCard } from '@/components/facevault/SummaryCard';
import { ResultsGrid } from '@/components/facevault/ResultsGrid';
import { StatsPanel } from '@/components/facevault/StatsPanel';
import { DeveloperPanel } from '@/components/facevault/DeveloperPanel';
import { PrivacyNotice } from '@/components/facevault/PrivacyNotice';
import { Button } from '@/components/ui/button';
import { useFaceVault } from '@/hooks/useFaceVault';
import { ArrowLeft } from 'lucide-react';

export default function Index() {
  const {
    imagePreview,
    detectedFaces,
    selectedFace,
    searchState,
    searchResults,
    saveQuery,
    developerSettings,
    handleImageUpload,
    handleSearch,
    resetSearch,
    setSelectedFace,
    setSaveQuery,
    updateDeveloperSetting,
  } = useFaceVault();

  // Derived state for screen visibility
  const isSearching = searchState.step !== 'idle' && searchState.step !== 'complete' && searchState.step !== 'error';
  const hasResults = searchResults !== null && searchState.step === 'complete';
  const showDashboard = !isSearching && !hasResults;
  const canSearch = selectedFace !== null && !isSearching && detectedFaces.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* ===== SCREEN: RESULTS VIEW ===== */}
        {hasResults && (
          <div className="space-y-6 animate-fade-in">
            <Button variant="ghost" onClick={resetSearch} className="gap-2 -ml-2 hover:bg-primary/10">
              <ArrowLeft className="h-4 w-4" />
              New Search
            </Button>

            <SummaryCard 
              response={searchResults} 
              showDetails={developerSettings.showRoutingCandidates} 
            />

            <ResultsGrid 
              results={searchResults.results} 
              developerSettings={developerSettings} 
            />

            <div className="grid md:grid-cols-2 gap-6">
              <StatsPanel response={searchResults} />
              <DeveloperPanel 
                settings={developerSettings} 
                onUpdate={updateDeveloperSetting} 
              />
            </div>
          </div>
        )}

        {/* ===== SCREEN: LOADING / PROGRESS VIEW ===== */}
        {isSearching && (
          <div className="py-12 animate-fade-in">
            <SearchProgress state={searchState} />
          </div>
        )}

        {/* ===== SCREEN: DASHBOARD / LANDING VIEW ===== */}
        {showDashboard && (
          <div className="space-y-8">
            {/* Hero text */}
            <div className="text-center space-y-3 py-4">
              <h2 className="text-3xl md:text-4xl font-display font-semibold text-foreground">
                Identity-Consistent Face Search
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
                Upload a photo to find matching identities with precision-first retrieval.
                Low-confidence results are clearly flagged.
              </p>
            </div>

            {/* System Stats */}
            <SystemStats />

            {/* Main content grid */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Search Panel - takes 2 columns */}
              <div className="lg:col-span-2">
                <SearchPanel
                  onImageUpload={handleImageUpload}
                  imagePreview={imagePreview}
                  detectedFaces={detectedFaces}
                  selectedFace={selectedFace}
                  onSelectFace={setSelectedFace}
                  onClear={resetSearch}
                  onSearch={handleSearch}
                  canSearch={canSearch}
                />
              </div>

              {/* Sidebar - Reliability + Privacy */}
              <div className="space-y-6">
                <ReliabilityCard />
                <PrivacyNotice saveQuery={saveQuery} onSaveQueryChange={setSaveQuery} />
              </div>
            </div>

            {/* Recent Searches */}
            <RecentSearches />

            {/* Developer Panel at bottom */}
            <DeveloperPanel 
              settings={developerSettings} 
              onUpdate={updateDeveloperSetting} 
            />
          </div>
        )}

        {/* Error state */}
        {searchState.step === 'error' && !hasResults && (
          <div className="py-12 text-center animate-fade-in">
            <div className="card-elevated max-w-md mx-auto p-8">
              <p className="text-destructive font-medium mb-4">{searchState.message}</p>
              <Button onClick={resetSearch}>Try Again</Button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16 py-6 bg-card/50">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          FaceVault — Precision-focused face search with transparency
        </div>
      </footer>
    </div>
  );
}
