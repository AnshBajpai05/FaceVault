import { useCallback, useState } from 'react';
import { Upload, Image as ImageIcon, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DetectedFace } from '@/types/facevault';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SearchPanelProps {
  onImageUpload: (file: File) => void;
  imagePreview: string | null;
  detectedFaces: DetectedFace[];
  selectedFace: string | null;
  onSelectFace: (faceId: string) => void;
  onClear: () => void;
  onSearch: () => void;
  canSearch: boolean;
}

export function SearchPanel({
  onImageUpload,
  imagePreview,
  detectedFaces,
  selectedFace,
  onSelectFace,
  onClear,
  onSearch,
  canSearch,
}: SearchPanelProps) {
  const [isDragging, setIsDragging] = useState(false);

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
    <Card className="card-elevated overflow-hidden animate-fade-in">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-accent/5 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Search className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xl font-display">Identity Search</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload a photo to find identity-consistent matches
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        {imagePreview ? (
          <div className="space-y-4">
            {/* Image with face overlays */}
            <div className="relative rounded-xl overflow-hidden border border-border">
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full shadow-md bg-card/90 backdrop-blur-sm"
                onClick={onClear}
              >
                <X className="h-4 w-4" />
              </Button>

              <img
                src={imagePreview}
                alt="Uploaded"
                className="w-full max-h-[300px] object-contain bg-muted/30"
              />
              
              {/* Face bounding boxes */}
              {detectedFaces.map((face) => (
                <button
                  key={face.id}
                  onClick={() => onSelectFace(face.id)}
                  className={cn(
                    "absolute border-2 rounded-lg transition-all duration-200 cursor-pointer",
                    "hover:border-primary hover:shadow-lg hover:bg-primary/10",
                    selectedFace === face.id
                      ? "border-primary bg-primary/15 shadow-md ring-2 ring-primary/30"
                      : "border-white/60 bg-white/10"
                  )}
                  style={{
                    left: `${face.boundingBox.x * 100}%`,
                    top: `${face.boundingBox.y * 100}%`,
                    width: `${face.boundingBox.width * 100}%`,
                    height: `${face.boundingBox.height * 100}%`,
                  }}
                >
                  {selectedFace === face.id && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-2.5 py-1 rounded-full whitespace-nowrap font-medium shadow-lg">
                      Selected
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Face detection info + search button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="text-sm text-muted-foreground">
                {detectedFaces.length === 0 ? (
                  <span className="text-destructive">No faces detected</span>
                ) : detectedFaces.length === 1 ? (
                  <span>1 face detected • Ready to search</span>
                ) : (
                  <span>{detectedFaces.length} faces detected • Select one to search</span>
                )}
              </div>
              
              <Button 
                size="lg" 
                onClick={onSearch} 
                disabled={!canSearch} 
                className="gap-2 px-6 shadow-md"
              >
                <Search className="h-4 w-4" />
                Search Identity
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
              "flex flex-col items-center justify-center py-12 px-6",
              "cursor-pointer hover:border-primary/60 hover:bg-primary/5",
              isDragging
                ? "border-primary bg-primary/10 scale-[1.01]"
                : "border-border bg-muted/30"
            )}
          >
            <input
              type="file"
              accept="image/*"
              onChange={handleFileInput}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            
            <div className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-all",
              isDragging ? "bg-primary/20" : "bg-muted"
            )}>
              {isDragging ? (
                <ImageIcon className="h-7 w-7 text-primary" />
              ) : (
                <Upload className="h-7 w-7 text-muted-foreground" />
              )}
            </div>

            <h3 className="text-lg font-medium text-foreground mb-1.5">
              {isDragging ? "Drop your image here" : "Upload an image"}
            </h3>
            
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Drag and drop, or click to browse
              <br />
              <span className="text-xs">JPG, PNG, WebP supported</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
