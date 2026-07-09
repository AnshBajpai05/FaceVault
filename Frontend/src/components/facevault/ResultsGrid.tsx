import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchResult, DeveloperSettings } from "@/types/facevault";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle, Download, Image as ImageIcon, ArrowUpCircle, Ban } from "lucide-react";

import { API_BASE, API_ROOT } from "@/lib/api";
import { logAuditAction } from "@/lib/audit";

interface ResultsGridProps {
  results: SearchResult[];
  developerSettings: DeveloperSettings;
}

export function ResultsGrid({ results, developerSettings }: ResultsGridProps) {
  const [selectedImage, setSelectedImage] = useState<SearchResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  
  // State tracking manually corrected cases via Human-in-the-Loop
  const [promotedFaceIds, setPromotedFaceIds] = useState<string[]>([]);
  const [selectedBorderlineIds, setSelectedBorderlineIds] = useState<string[]>([]);
  const [explicitlyRejectedIds, setExplicitlyRejectedIds] = useState<string[]>([]);

  // Filtering Logic
  const highConfidence = useMemo(() => {
    return results.filter(r => 
      !explicitlyRejectedIds.includes(r.face_id) && 
      (r.cosine_similarity >= developerSettings.similarityThreshold || promotedFaceIds.includes(r.face_id))
    );
  }, [results, developerSettings.similarityThreshold, promotedFaceIds, explicitlyRejectedIds]);

  const borderline = useMemo(() => {
    const lowerBound = developerSettings.similarityThreshold - 0.10;
    return results.filter(r => 
      !explicitlyRejectedIds.includes(r.face_id) && 
      !promotedFaceIds.includes(r.face_id) &&
      r.cosine_similarity >= lowerBound && 
      r.cosine_similarity < developerSettings.similarityThreshold
    );
  }, [results, developerSettings.similarityThreshold, promotedFaceIds, explicitlyRejectedIds]);

  const rejected = useMemo(() => {
    const lowerBound = developerSettings.similarityThreshold - 0.10;
    return results.filter(r => 
      explicitlyRejectedIds.includes(r.face_id) || 
      (r.cosine_similarity < lowerBound && !promotedFaceIds.includes(r.face_id))
    );
  }, [results, developerSettings.similarityThreshold, promotedFaceIds, explicitlyRejectedIds]);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const faceIds = results.map(r => r.face_id).filter(Boolean);

      // Audit download action
      logAuditAction('download', `Downloaded ZIP extract of ${faceIds.length} candidate artifacts`);

      const res = await fetch(`${API_BASE}/download-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ face_ids: faceIds })
      });

      if (!res.ok) throw new Error(await res.text());

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "facevault_matches.zip";
      a.click();

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 1000);
    } catch (err) {
      console.error(err);
      alert("Download failed — check backend logs.");
    } finally {
      setDownloading(false);
    }
  };

  const promoteSelected = () => {
    // Audit Telemetry: Sync HITL Feedback to Vector Engine
    selectedBorderlineIds.forEach(id => {
      logAuditAction("promote", `Corrected boundary case face_id: ${id.substring(0,8)}...`, {
        face_id: id,
        threshold: developerSettings.similarityThreshold
      }, true);
    });

    setPromotedFaceIds(prev => [...prev, ...selectedBorderlineIds]);
    setSelectedBorderlineIds([]);
  };

  const rejectFalsePositive = () => {
    if (!selectedImage) return;
    
    // Audit Telemetry: Explicit HITL false-positive demotion
    logAuditAction("reject_false_positive", `Flagged false positive face_id: ${selectedImage.face_id.substring(0,8)}...`, {
      face_id: selectedImage.face_id,
      threshold: developerSettings.similarityThreshold
    }, true);

    setExplicitlyRejectedIds(prev => [...prev, selectedImage.face_id]);
    setSelectedImage(null); // close modal
  };

  return (
    <>
      <div className="flex justify-between items-center mb-3 mt-8">
        <CardTitle className="text-xl font-display tracking-tight text-foreground/90">Matched Images</CardTitle>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
        >
          <Download className="h-4 w-4" />
          {downloading ? "Preparing ZIP…" : "Download ZIP"}
        </button>
      </div>

      <Card className="animate-fade-in card-elevated">
        <CardHeader className="pb-4" />
        <CardContent>
          <Tabs defaultValue="high_confidence" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6 bg-background/50 h-auto p-1.5 rounded-xl border border-border/50">
              <TabsTrigger value="high_confidence" className="py-2.5 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm transition-all group">
                <CheckCircle2 className="h-4 w-4 mr-2 text-status-success" />
                High Confirm
                <span className="ml-2 bg-muted text-foreground px-2 py-0.5 rounded-full text-xs font-mono">{highConfidence.length}</span>
              </TabsTrigger>

              <TabsTrigger value="borderline" className="py-2.5 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm transition-all group">
                <AlertTriangle className="h-4 w-4 mr-2 text-status-warning" />
                Borderline
                <span className="ml-2 bg-muted text-foreground px-2 py-0.5 rounded-full text-xs font-mono">{borderline.length}</span>
              </TabsTrigger>

              {developerSettings.showRejectedResults && (
                <TabsTrigger value="rejected" className="py-2.5 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm transition-all group">
                  <XCircle className="h-4 w-4 mr-2 text-status-error" />
                  Rejected
                  <span className="ml-2 bg-muted text-foreground px-2 py-0.5 rounded-full text-xs font-mono">{rejected.length}</span>
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="high_confidence" className="focus-visible:outline-none focus-visible:ring-0">
              <ImageGrid 
                images={highConfidence} 
                onSelect={setSelectedImage}
                showSimilarity={developerSettings.showSimilarityValues}
              />
            </TabsContent>

            <TabsContent value="borderline" className="focus-visible:outline-none focus-visible:ring-0">
              {borderline.length > 0 && (
                <div className="flex justify-between items-center mb-4 px-3 py-3 rounded-xl bg-status-warning/10 border border-status-warning/20">
                  <p className="text-sm text-status-warning-foreground font-medium">
                    Human-in-the-Loop: Review borderline cases and explicitly rescue correct matches.
                  </p>
                  
                  <button
                    onClick={promoteSelected}
                    disabled={selectedBorderlineIds.length === 0}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-status-success text-status-success-foreground hover:bg-status-success-foreground hover:text-white transition-all text-sm font-semibold border border-status-success/30 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                  >
                    <ArrowUpCircle className="h-4 w-4" />
                    Promote to High Confirm ({selectedBorderlineIds.length})
                  </button>
                </div>
              )}

              <ImageGrid 
                images={borderline} 
                onSelect={setSelectedImage}
                showSimilarity={developerSettings.showSimilarityValues}
                selectable={true}
                selectedIds={selectedBorderlineIds}
                onToggleSelect={(id) => {
                  setSelectedBorderlineIds(prev => 
                    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                  )
                }}
              />
            </TabsContent>

            {developerSettings.showRejectedResults && (
              <TabsContent value="rejected" className="focus-visible:outline-none focus-visible:ring-0">
                <ImageGrid 
                  images={rejected} 
                  onSelect={setSelectedImage}
                  showSimilarity={developerSettings.showSimilarityValues}
                />
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-3xl bg-card/95 border-border/50 backdrop-blur-3xl shadow-2xl">
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-white/5">
            <DialogTitle className="text-xl font-display">Target Identity Details</DialogTitle>
          </DialogHeader>

          {selectedImage && (
            <div className="space-y-6 pt-4">

              <div className="rounded-xl overflow-hidden bg-black/40 border border-white/10 relative group flex justify-center py-2">
                <img
                  src={`${API_ROOT}${selectedImage.photo_url}`}
                  alt="Match result display"
                  className="w-auto h-auto max-h-[420px] object-contain shadow-2xl rounded-md"
                  onError={e => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
                />
                
                {/* Visual explicit reject button within the image modal */}
                {!explicitlyRejectedIds.includes(selectedImage.face_id) && (
                  <button 
                    onClick={rejectFalsePositive}
                    className="absolute top-4 right-4 bg-status-error/90 hover:bg-status-error text-white px-3 py-1.5 rounded-md flex items-center gap-2 text-sm font-semibold transition-all shadow-lg border border-red-400/50 backdrop-blur-md"
                  >
                    <Ban className="w-4 h-4" />
                    Flag as False Positive
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mt-4">
                <div className="bg-muted/30 rounded-xl p-4 border border-white/5 transition-colors hover:bg-muted/50">
                  <p className="text-muted-foreground/70 text-[10px] mb-1 font-bold uppercase tracking-widest">Identity ID</p>
                  <p className="font-mono font-medium text-foreground/90">{selectedImage.identity_id}</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-4 border border-white/5 transition-colors hover:bg-muted/50">
                  <p className="text-muted-foreground/70 text-[10px] mb-1 font-bold uppercase tracking-widest">Original Group</p>
                  <p className="font-medium capitalize text-foreground/90">{selectedImage.group.replace("_", " ")}</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-4 border border-white/5 transition-colors hover:bg-muted/50">
                  <p className="text-muted-foreground/70 text-[10px] mb-1 font-bold uppercase tracking-widest">Vector Similarity</p>
                  <p className="font-mono font-bold text-primary">{(selectedImage.cosine_similarity * 100).toFixed(2)}%</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-4 border border-white/5 transition-colors hover:bg-muted/50">
                  <p className="text-muted-foreground/70 text-[10px] mb-1 font-bold uppercase tracking-widest">Centroid Baseline</p>
                  <p className="font-mono font-medium text-foreground/90">{(selectedImage.centroid_similarity * 100).toFixed(2)}%</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}


function ImageGrid({
  images,
  onSelect,
  showSimilarity,
  selectable = false,
  selectedIds = [],
  onToggleSelect,
}: {
  images: SearchResult[];
  onSelect: (img: SearchResult) => void;
  showSimilarity: boolean;
  selectable?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}) {
  if (!images.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 bg-muted/10 rounded-xl border border-dashed border-border/60 shadow-inner">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4 text-muted-foreground/50">
          <ImageIcon className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-1">No Matches Found</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          There are no images that fall into this strict boundary condition.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 fade-in-stagger">
      {images.map((image, index) => {
        const isCurrentlySelected = selectedIds.includes(image.face_id);

        return (
          <div key={image.face_id + index} className="relative group p-0.5 rounded-xl transition-all">
            <button 
              onClick={() => onSelect(image)}
              className={cn(
                "relative aspect-square rounded-[10px] overflow-hidden bg-muted w-full focus-visible:outline-none",
                "border border-white/10 dark:border-white/5 shadow-md transition-all duration-300",
                "hover:shadow-xl hover:border-primary/80 block",
                isCurrentlySelected && "ring-2 ring-primary ring-offset-2 ring-offset-background opacity-90 scale-[0.98]"
              )}>
              
              <img
                src={`${API_ROOT}${image.photo_url}`}
                loading="lazy"
                className={cn(
                  "w-full h-full object-cover transition-transform duration-500",
                  isCurrentlySelected ? "scale-100" : "group-hover:scale-110"
                )}
                alt="Search result match"
              />

              {showSimilarity && (
                <div className="absolute inset-x-0 bottom-0 pt-8 pb-2 px-2 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none">
                  <div className="flex items-center gap-1.5 backdrop-blur-md bg-black/50 w-fit px-2 py-0.5 rounded-full border border-white/20 shadow-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    <p className="text-[10px] text-white font-mono tracking-wider font-medium">
                      {(image.cosine_similarity * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              )}
            </button>
            
            {/* Multi-select checkmark overlay widget */}
            {selectable && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect?.(image.face_id);
                }}
                className={cn(
                  "absolute top-2.5 right-2.5 w-7 h-7 rounded-md flex items-center justify-center transition-all z-10",
                  isCurrentlySelected
                    ? "bg-primary border-transparent text-white scale-110 shadow-[0_0_15px_rgba(var(--primary),0.6)]"
                    : "bg-black/50 border-2 border-white/60 text-transparent hover:text-white hover:border-primary/80 hover:bg-black/70 backdrop-blur-sm"
                )}
              >
                <CheckCircle2 className={cn("w-4 h-4", isCurrentlySelected ? "text-white" : "text-inherit")} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
