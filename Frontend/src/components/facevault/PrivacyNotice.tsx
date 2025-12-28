import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Shield, Lock } from 'lucide-react';

interface PrivacyNoticeProps {
  saveQuery: boolean;
  onSaveQueryChange: (checked: boolean) => void;
}

export function PrivacyNotice({ saveQuery, onSaveQueryChange }: PrivacyNoticeProps) {
  return (
    <div className="card-elevated p-5 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-3 flex-1">
          <div>
            <p className="text-sm font-medium text-foreground">Privacy Notice</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Uploaded images are processed in memory and not stored by default. 
              Query results are returned immediately and then discarded.
            </p>
          </div>
          
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="save-query"
              checked={saveQuery}
              onCheckedChange={(checked) => onSaveQueryChange(checked === true)}
            />
            <Label 
              htmlFor="save-query" 
              className="text-xs cursor-pointer text-muted-foreground"
            >
              Save this query for analysis (optional)
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}
