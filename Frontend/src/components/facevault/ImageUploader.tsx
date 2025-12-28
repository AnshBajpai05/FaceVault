import { useCallback, useState } from 'react';
import { Upload, Image as ImageIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DetectedFace } from '@/types/facevault';
import { Button } from '@/components/ui/button';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  imagePreview: string | null;
  detectedFaces: DetectedFace[];
  selectedFace: string | null;
  onSelectFace: (faceId: string) => void;
  onClear: () => void;
}

export function ImageUploader({
  onImageUpload,
  imagePreview,
  detectedFaces,
  selectedFace,
  onSelectFace,
  onClear,
}: ImageUploaderProps) {
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

  if (imagePreview) {
    return (
      <div className="animate-fade-in">
        <div className="relative rounded-xl overflow-hidden bg-card border border-border shadow-sm">
          {/* Clear button */}
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full shadow-md"
            onClick={onClear}
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Image with face overlays */}
          <div className="relative">
            <img
              src={imagePreview}
              alt="Uploaded"
              className="w-full max-h-[400px] object-contain"
            />
            
            {/* Face bounding boxes */}
            {detectedFaces.map((face) => (
              <button
                key={face.id}
                onClick={() => onSelectFace(face.id)}
                className={cn(
                  "absolute border-2 rounded-lg transition-all duration-200 cursor-pointer",
                  "hover:border-primary hover:shadow-lg",
                  selectedFace === face.id
                    ? "border-primary bg-primary/10 shadow-md"
                    : "border-muted-foreground/40 bg-transparent"
                )}
                style={{
                  left: `${face.boundingBox.x * 100}%`,
                  top: `${face.boundingBox.y * 100}%`,
                  width: `${face.boundingBox.width * 100}%`,
                  height: `${face.boundingBox.height * 100}%`,
                }}
              >
                {selectedFace === face.id && (
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full whitespace-nowrap">
                    Selected
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Face detection info */}
          <div className="p-4 bg-muted/30 border-t border-border">
            {detectedFaces.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center">
                No faces detected. Please try another image.
              </p>
            ) : detectedFaces.length === 1 ? (
              <p className="text-sm text-muted-foreground text-center">
                1 face detected • Ready to search
              </p>
            ) : (
              <p className="text-sm text-muted-foreground text-center">
                {detectedFaces.length} faces detected • Click on a face to select it
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "relative rounded-xl border-2 border-dashed transition-all duration-200",
        "flex flex-col items-center justify-center py-16 px-8",
        "cursor-pointer hover:border-primary/60 hover:bg-muted/30",
        isDragging
          ? "border-primary bg-primary/5 scale-[1.02]"
          : "border-border bg-card"
      )}
    >
      <input
        type="file"
        accept="image/*"
        onChange={handleFileInput}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
      
      <div className={cn(
        "w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors",
        isDragging ? "bg-primary/10" : "bg-muted"
      )}>
        {isDragging ? (
          <ImageIcon className="h-8 w-8 text-primary" />
        ) : (
          <Upload className="h-8 w-8 text-muted-foreground" />
        )}
      </div>

      <h3 className="text-lg font-medium text-foreground mb-2">
        {isDragging ? "Drop your image here" : "Upload an image"}
      </h3>
      
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        Drag and drop an image here, or click to browse.
        <br />
        Supported formats: JPG, PNG, WebP
      </p>
    </div>
  );
}

