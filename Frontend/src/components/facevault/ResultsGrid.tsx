import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchResult, DeveloperSettings } from "@/types/facevault";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle, Download } from "lucide-react";

import { API_BASE, API_ROOT } from "@/lib/api";   // ⭐ IMPORTANT

// =======================
// Time formatter
// =======================
function timeAgo(ts: string) {

  // If timestamp does NOT specify timezone, assume UTC
  if (ts && !ts.endsWith("Z")) {
    ts = ts + "Z";
  }

  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} mins ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hours ago`;

  const days = Math.floor(hrs / 24);
  return `${days} days ago`;
}

// =======================
// Status formatter
// =======================
function formatStatus(s: string) {

  switch (s) {
    case "accepted":
      return "Accepted";

    case "ambiguous":
      return "Ambiguous";

    case "gray_zone":
      return "Low Confidence";

    case "new_identity":
      return "No Match";

    default:
      return s;
  }
}



interface ResultsGridProps {
  results: SearchResult[];
  developerSettings: DeveloperSettings;
}

export function ResultsGrid({ results, developerSettings }: ResultsGridProps) {
  const [selectedImage, setSelectedImage] = useState<SearchResult | null>(null);
  const [downloading, setDownloading] = useState(false);

  const highConfidence = results.filter(r => r.group === "high_confidence");
  const borderline = results.filter(r => r.group === "borderline");
  const rejected = results.filter(r => r.group === "rejected");

  const handleDownload = async () => {
    try {
      setDownloading(true);

      // ⭐ ensure we always send VALID ids
      const faceIds = results
        .map(r => r.face_id)
        .filter(Boolean);

      const res = await fetch(`${API_BASE}/download-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ face_ids: faceIds })
      });

      if (!res.ok) throw new Error(await res.text());

      // ⭐ force ZIP MIME handling
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "facevault_matches.zip";
      a.click();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Download failed — check backend logs.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="flex justify-between items-center mb-3">
        <CardTitle className="text-lg font-display">Matched Images</CardTitle>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-3 py-2 rounded-md 
                     bg-primary text-primary-foreground hover:bg-primary/90
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="h-4 w-4" />
          {downloading ? "Preparing ZIP…" : "Download ZIP"}
        </button>
      </div>

      <Card className="animate-fade-in">
        <CardHeader className="pb-2" />
        <CardContent>
          <Tabs defaultValue="high_confidence">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="high_confidence">
                <CheckCircle2 className="h-4 w-4 text-status-success" />
                High
                <span className="text-xs px-2">{highConfidence.length}</span>
              </TabsTrigger>

              <TabsTrigger value="borderline">
                <AlertTriangle className="h-4 w-4 text-status-warning" />
                Borderline
                <span className="text-xs px-2">{borderline.length}</span>
              </TabsTrigger>

              {developerSettings.showRejectedResults && (
                <TabsTrigger value="rejected">
                  <XCircle className="h-4 w-4 text-status-error" />
                  Rejected
                  <span className="text-xs px-2">{rejected.length}</span>
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="high_confidence">
              <ImageGrid images={highConfidence} onSelect={setSelectedImage}
                showSimilarity={developerSettings.showSimilarityValues}/>
            </TabsContent>

            <TabsContent value="borderline">
              <ImageGrid images={borderline} onSelect={setSelectedImage}
                showSimilarity={developerSettings.showSimilarityValues}/>
            </TabsContent>

            {developerSettings.showRejectedResults && (
              <TabsContent value="rejected">
                <ImageGrid images={rejected} onSelect={setSelectedImage}
                  showSimilarity={developerSettings.showSimilarityValues}/>
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Image Details</DialogTitle>
          </DialogHeader>

          {selectedImage && (
            <div className="space-y-4">

              <div className="rounded-lg overflow-hidden bg-muted">
                <img
                  src={`${API_ROOT}${selectedImage.photo_url}`}
                  alt="Match result"
                  className="w-full h-auto max-h-[400px] object-contain"
                  onError={e => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">

                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-muted-foreground mb-1">Identity ID</p>
                  <p className="font-mono font-medium">{selectedImage.identity_id}</p>
                </div>

                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-muted-foreground mb-1">Match Group</p>
                  <p className="font-medium capitalize">
                    {selectedImage.group.replace("_", " ")}
                  </p>
                </div>

                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-muted-foreground mb-1">Cosine Similarity</p>
                  <p className="font-mono font-medium">
                    {(selectedImage.cosine_similarity * 100).toFixed(2)} %
                  </p>
                </div>

                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-muted-foreground mb-1">Centroid Similarity</p>
                  <p className="font-mono font-medium">
                    {(selectedImage.centroid_similarity * 100).toFixed(2)} %
                  </p>
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
  showSimilarity
}: {
  images: SearchResult[];
  onSelect: (img: SearchResult) => void;
  showSimilarity: boolean;
}) {
  if (!images.length)
    return <div className="text-center py-12 text-muted-foreground">No images</div>;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
      {images.map((image, index) => (
        <button key={index} onClick={() => onSelect(image)}
          className={cn("relative aspect-square rounded-lg overflow-hidden bg-muted hover:ring-2 hover:ring-primary")}>
          
          <img
            src={`${API_ROOT}${image.photo_url}`}   // ⭐ FIXED
            className="w-full h-full object-cover"
          />

          {showSimilarity && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1">
              <p className="text-[10px] text-white font-mono">
                {(image.cosine_similarity * 100).toFixed(0)}%
              </p>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}


import { useEffect} from "react";
import { getRecentSearches } from "@/lib/api";

interface RecentItem {
  timestamp: string;
  status: string;
  precision: number;
  identity: string | null;
}

export function RecentSearches() {
  const [items, setItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    getRecentSearches().then(setItems).catch(console.error);
  }, []);

  return (
    <div className="card-elevated p-4">
      <h3 className="font-display text-lg mb-2">Recent Searches</h3>

      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>Time</th>
            <th>Status</th>
            <th>Precision</th>
            <th>Identity</th>
          </tr>
        </thead>

        <tbody>
          {items.map((r, i) => (
            <tr key={i}>
              <td>{timeAgo(r.timestamp)}</td>
              <td>{formatStatus(r.status)}</td>
              <td>{Math.round(r.precision * 100)}%</td>
              <td>{r.identity ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
