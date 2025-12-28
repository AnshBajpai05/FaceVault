import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from './StatusBadge';
import { SearchResponse } from '@/types/facevault';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SummaryCardProps {
  response: SearchResponse;
  showDetails?: boolean;
}

export function SummaryCard({ response, showDetails = false }: SummaryCardProps) {
  const { routing, cluster } = response;

  const warningMessages = {
    ambiguous: {
      icon: AlertTriangle,
      title: 'Ambiguous Results',
      message: 'Results may include visually similar identities. Manual review is recommended.',
      className: 'bg-status-warning-bg border-status-warning/30',
    },
    low_confidence: {
      icon: AlertTriangle,
      title: 'Low Confidence',
      message: 'Identity confidence is weak — treat results as exploratory.',
      className: 'bg-status-caution-bg border-status-caution/30',
    },
    no_match: {
      icon: Info,
      title: 'No Match Found',
      message: 'This face does not match any known identity in the database.',
      className: 'bg-status-error-bg border-status-error/30',
    },
  };

  const warning = routing.status !== 'accepted' ? warningMessages[routing.status] : null;

  return (
    <Card className="animate-fade-in overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-xl font-display">Search Results</CardTitle>
          <StatusBadge status={routing.status} size="lg" />
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Warning message */}
        {warning && (
          <div className={cn(
            "flex items-start gap-3 p-4 rounded-lg border",
            warning.className
          )}>
            <warning.icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-sm">{warning.title}</p>
              <p className="text-sm opacity-90 mt-0.5">{warning.message}</p>
            </div>
          </div>
        )}

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricItem
            label="Identity ID"
            value={routing.identity_id}
            highlight
          />
          <MetricItem
            label="Similarity"
            value={`${(routing.similarity * 100).toFixed(1)}%`}
          />
          <MetricItem
            label="Centroid Similarity"
            value={`${(cluster.centroid_similarity * 100).toFixed(1)}%`}
          />
          <MetricItem
            label="Precision Estimate"
            value={`${(cluster.precision_estimate * 100).toFixed(0)}%`}
          />
        </div>

        {/* Extended details for developer mode */}
        {showDetails && (
          <div className="pt-4 border-t border-border">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">
              Technical Details
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <DetailItem label="Query ID" value={response.query_id} />
              <DetailItem label="Faces Detected" value={response.faces_detected.toString()} />
              <DetailItem label="Routing Margin" value={routing.margin.toFixed(3)} />
              <DetailItem label="Threshold Used" value={cluster.threshold_used.toString()} />
              <DetailItem 
                label="Flagged Unreliable" 
                value={cluster.flagged_unreliable ? 'Yes' : 'No'} 
              />
              <DetailItem 
                label="Flags" 
                value={cluster.flags.length > 0 ? cluster.flags.join(', ') : 'None'} 
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricItem({ 
  label, 
  value, 
  highlight = false 
}: { 
  label: string; 
  value: string; 
  highlight?: boolean;
}) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn(
        "font-medium",
        highlight && "text-primary font-semibold"
      )}>
        {value}
      </p>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{' '}
      <span className="font-mono">{value}</span>
    </div>
  );
}
