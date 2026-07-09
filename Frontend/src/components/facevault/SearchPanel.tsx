import { useCallback, useState } from 'react';
import { Upload, Image as ImageIcon, X, Search, CheckSquare, Square, UserSquare2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DetectedFace } from '@/types/facevault';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SearchPanelProps {
  onImageUpload: (file: File) => void;
  imagePreview: string | null;
  detectedFaces: DetectedFace[];
  selectedFaces: string[];
  onToggleFace: (faceId: string) => void;
  onSelectAllFaces: () => void;
  onClear: () => void;
  onSearch: () => void;
  canSearch: boolean;
}

export function SearchPanel({
  onImageUpload,
  imagePreview,
  detectedFaces,
  selectedFaces,
  onToggleFace,
  onSelectAllFaces,
  onClear,
  onSearch,
  canSearch,
}: SearchPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        onImageUpload(file);
      }
    },
    [onImageUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onImageUpload(file);
      }
    },
    [onImageUpload]
  );

  return (
    <Card className="card-elevated overflow-hidden animate-fade-in relative z-10">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-accent/5 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Search className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xl font-display">Identity Search</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload a photo to find identity-consistent matches in the FAISS vector index.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        {imagePreview ? (
          <div className="space-y-5">
            
            {/* Multi-Select Ribbon for Crowd Photos */}
            {detectedFaces.length > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-primary/10 border border-primary/20 p-4 rounded-xl overflow-hidden gap-4">
                <div>
                  <h4 className="text-sm text-foreground font-semibold flex items-center gap-2">
                    <UserSquare2 className="w-4 h-4 text-primary" />
                    Multiple Faces Detected
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click the bounding boxes on the image or the buttons below to mark the faces you want to search.
                  </p>
                </div>
                <Button variant="default" size="sm" onClick={onSelectAllFaces} className="gap-2 shrink-0 shadow-md whitespace-nowrap">
                  <CheckSquare className="w-4 h-4" />
                  Select All {detectedFaces.length} Faces
                </Button>
              </div>
            )}

            {/* Quick Select Buttons Grid (Fallback if boxes are hard to click) */}
            {detectedFaces.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {detectedFaces.map((face, idx) => {
                  const isSelected = selectedFaces.includes(face.id);
                  return (
                    <button
                      key={`btn-${face.id}`}
                      onClick={() => onToggleFace(face.id)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
                        isSelected 
                          ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/30" 
                          : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:bg-primary/5"
                      )}
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      Face {idx + 1}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Image with dynamic face overlays */}
            <div className="relative rounded-xl overflow-hidden border border-border shadow-inner bg-black/40 flex justify-center">
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-3 right-3 z-20 h-8 w-8 rounded-full shadow-md bg-card/90 backdrop-blur-sm hover:bg-destructive hover:text-white transition-colors"
                onClick={onClear}
              >
                <X className="h-4 w-4" />
              </Button>

              <div className="relative inline-block">
                <img
                  src={imagePreview}
                  alt="Uploaded"
                  className="max-h-[400px] w-auto object-contain block"
                  onLoad={(e) => {
                    const target = e.target as HTMLImageElement;
                    setImgDims({ w: target.naturalWidth, h: target.naturalHeight });
                  }}
                />
                
                {/* Face bounding boxes - properly scaled regardless of backend format */}
                {imgDims && detectedFaces.map((face, idx) => {
                  const isSelected = selectedFaces.includes(face.id);
                  const box = face.boundingBox;
                  
                  // Handle both normalized [0..1] and absolute pixel coordinates dynamically
                  const isNormalized = box.width <= 1.0 && box.height <= 1.0;
                  const leftPct = isNormalized ? box.x * 100 : (box.x / imgDims.w) * 100;
                  const topPct = isNormalized ? box.y * 100 : (box.y / imgDims.h) * 100;
                  const widthPct = isNormalized ? box.width * 100 : (box.width / imgDims.w) * 100;
                  const heightPct = isNormalized ? box.height * 100 : (box.height / imgDims.h) * 100;

                  return (
                    <button
                      key={face.id}
                      onClick={() => onToggleFace(face.id)}
                      aria-label={`Select detected face ${face.id}`}
                      aria-pressed={isSelected}
                      className={cn(
                        "absolute border-[3px] rounded-md transition-all duration-200 cursor-crosshair group flex items-center justify-center",
                        "hover:shadow-[0_0_25px_rgba(var(--primary),0.8)] focus-visible:outline-none focus:ring-2 focus:ring-offset-2",
                        isSelected
                          ? "border-primary bg-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.6)] backdrop-blur-[1px]"
                          : "border-white/80 bg-white/10 hover:border-primary hover:bg-primary/30"
                      )}
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        width: `${widthPct}%`,
                        height: `${heightPct}%`,
                      }}
                    >
                      {/* Interaction hint overlay inside the box */}
                      <span className={cn(
                        "opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 flex items-center justify-center",
                        "font-bold text-white drop-shadow-md text-sm md:text-base pointer-events-none"
                      )}>
                        {isSelected ? "REMOVE" : "ADD"}
                      </span>

                      {isSelected && (
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap font-bold shadow-lg tracking-widest z-10">
                          FACE {idx + 1}
                        </div>
                      )}
                    </button> // End Face Box
                  );
                })}
              </div>
            </div>

            {/* Status Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="text-sm text-muted-foreground font-medium">
                {detectedFaces.length === 0 ? (
                  <span className="text-destructive flex items-center gap-2">
                    <X className="w-4 h-4" /> No faces detected
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-emerald-400" /> 
                    {selectedFaces.length} of {detectedFaces.length} faces queued for search
                  </span>
                )}
              </div>
              
              <Button 
                size="lg" 
                onClick={onSearch} 
                disabled={!canSearch} 
                className={cn(
                  "gap-2 px-8 shadow-xl font-bold transition-all",
                  canSearch ? "shadow-primary/40 hover:shadow-primary/60 scale-100" : "opacity-50 scale-95"
                )}
              >
                <Search className="h-4 w-4" />
                Search Selected Faces
              </Button>
            </div>
          </div>
        ) : (
          /* Upload dropzone */
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              "relative rounded-xl border-2 border-dashed transition-all duration-200",
              "flex flex-col items-center justify-center py-16 px-6",
              "cursor-pointer hover:border-primary/60 hover:bg-primary/5",
              isDragging
                ? "border-primary bg-primary/10 scale-[1.01]"
                : "border-white/10 bg-muted/30"
            )}
          >
            <input
              type="file"
              accept="image/*"
              onChange={handleFileInput}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center mb-5 transition-all shadow-lg",
              isDragging ? "bg-primary/20 shadow-[0_0_20px_rgba(var(--primary),0.5)]" : "bg-black/40 border border-white/5"
            )}>
              {isDragging ? (
                <ImageIcon className="h-8 w-8 text-primary animate-pulse" />
              ) : (
                <Upload className="h-8 w-8 text-white/70" />
              )}
            </div>

            <h3 className="text-xl font-medium text-foreground mb-1.5 font-display">
              {isDragging ? "Drop image here" : "Upload a photo"}
            </h3>

            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Drag and drop, or click to browse
              <br />
              <span className="text-xs opacity-70 mt-2 block">All faces in the image are detected automatically — you pick which to search</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
