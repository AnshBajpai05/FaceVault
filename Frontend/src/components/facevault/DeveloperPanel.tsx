import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DeveloperSettings } from '@/types/facevault';
import { Settings2, ChevronDown, Code2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface DeveloperPanelProps {
  settings: DeveloperSettings;
  onUpdate: <K extends keyof DeveloperSettings>(key: K, value: DeveloperSettings[K]) => void;
}

export function DeveloperPanel({ settings, onUpdate }: DeveloperPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="card-elevated overflow-hidden animate-fade-in">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-4">
            <CardTitle className="text-lg font-display flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                  <Settings2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <span className="block">Developer Mode</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Advanced settings & debug options
                  </span>
                </div>
              </div>
              <ChevronDown 
                className={cn(
                  "h-5 w-5 text-muted-foreground transition-transform duration-200",
                  isOpen && "rotate-180"
                )} 
              />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-6 pt-0 border-t border-border">
            {/* Toggle options */}
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <Label htmlFor="show-similarity" className="text-sm cursor-pointer flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  Show similarity values on thumbnails
                </Label>
                <Switch
                  id="show-similarity"
                  checked={settings.showSimilarityValues}
                  onCheckedChange={(checked) => onUpdate('showSimilarityValues', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <Label htmlFor="show-routing" className="text-sm cursor-pointer flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  Show routing candidates & technical details
                </Label>
                <Switch
                  id="show-routing"
                  checked={settings.showRoutingCandidates}
                  onCheckedChange={(checked) => onUpdate('showRoutingCandidates', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <Label htmlFor="show-rejected" className="text-sm cursor-pointer flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  Show rejected results tab
                </Label>
                <Switch
                  id="show-rejected"
                  checked={settings.showRejectedResults}
                  onCheckedChange={(checked) => onUpdate('showRejectedResults', checked)}
                />
              </div>
            </div>

            {/* Threshold slider */}
            <div className="space-y-3 p-4 rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Similarity Threshold</Label>
                <span className="text-sm font-mono bg-card px-2 py-0.5 rounded border border-border">
                  {settings.similarityThreshold.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[settings.similarityThreshold]}
                onValueChange={([value]) => onUpdate('similarityThreshold', value)}
                min={0.2}
                max={0.9}
                step={0.01}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Minimum similarity score for matching. Higher = stricter.
              </p>
            </div>

            {/* Debug info placeholder */}
            <div className="p-4 rounded-lg bg-primary-dark/5 border border-primary/10">
              <p className="text-xs font-mono text-muted-foreground">
                Debug logs will appear here when enabled...
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
