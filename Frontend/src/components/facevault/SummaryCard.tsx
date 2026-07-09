import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from './StatusBadge';
import { SearchResponse, RoutingStatus } from '@/types/facevault';
import { AlertTriangle, Info, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SummaryCardProps {
  response: SearchResponse;
  showDetails?: boolean;
}

// Warning copy keyed by the backend routing statuses
const warningMessages: Partial<Record<RoutingStatus, {
  icon: LucideIcon;
  title: string;
  message: string;
  className: string;
}>> = {
  ambiguous: {
    icon: AlertTriangle,
    title: 'Ambiguous Results',
    message: 'Results may include visually similar identities. Manual review is recommended.',
    className: 'bg-status-warning-bg border-status-warning/30',
  },
  gray_zone: {
    icon: AlertTriangle,
    title: 'Low Confidence',
    message: 'Identity confidence is weak — treat results as exploratory.',
    className: 'bg-status-caution-bg border-status-caution/30',
  },
  new_identity: {
    icon: Info,
    title: 'No Match Found',
    message: 'This face does not match any known identity in the database.',
    className: 'bg-status-error-bg border-status-error/30',
  },
};

export function SummaryCard({ response, showDetails = false }: SummaryCardProps) {
  const { routing, cluster } = response;

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
            value={routing.identity_id ?? '—'}
            highlight
          />
          <MetricItem
            label="Similarity"
            value={`${(routing.similarity * 100).toFixed(1)}%`}
          />
          <MetricItem
            label="Centroid Similarity"
            value={cluster ? `${(cluster.centroid_similarity * 100).toFixed(1)}%` : '—'}
          />
          <MetricItem
            label="Precision Estimate"
            value={cluster ? `${(cluster.precision_estimate * 100).toFixed(0)}%` : '—'}
          />
        </div>

        {/* Per-query-face breakdown for multi-face searches */}
        {response.per_face && response.per_face.length > 1 && (
          <div className="pt-4 border-t border-border">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">
              Per-Face Breakdown ({response.per_face.length} query faces)
            </h4>
            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Face</th>
                    <th className="px-4 py-2 text-left font-medium">Routed Identity</th>
                    <th className="px-4 py-2 text-left font-medium">Similarity</th>
                    <th className="px-4 py-2 text-left font-medium">Matches</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {response.per_face.map((face, idx) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="px-4 py-2 font-medium">Face {idx + 1}</td>
                      <td className="px-4 py-2 font-mono text-xs">{face.identity_id ?? '—'}</td>
                      <td className="px-4 py-2 font-mono">{(face.similarity * 100).toFixed(1)}%</td>
                      <td className="px-4 py-2">{face.matches}</td>
                      <td className="px-4 py-2"><StatusBadge status={face.status} size="sm" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Extended details for developer mode */}
        {showDetails && (
          <div className="pt-4 border-t border-border">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">
              Technical Details
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <DetailItem label="Query ID" value={response.query_id} />
              <DetailItem label="Faces Searched" value={response.faces_detected.toString()} />
              <DetailItem label="Routing Margin" value={routing.margin.toFixed(3)} />
              <DetailItem label="Threshold Used" value={cluster ? cluster.threshold_used.toString() : '—'} />
              <DetailItem
                label="Flagged Unreliable"
                value={cluster ? (cluster.flagged_unreliable ? 'Yes' : 'No') : '—'}
              />
              <DetailItem
                label="Flags"
                value={cluster && cluster.flags.length > 0 ? cluster.flags.join(', ') : 'None'}
              />
              {response.timings && (
                <DetailItem
                  label="Backend Search Time"
                  value={`${response.timings.search_ms.toFixed(1)} ms`}
                />
              )}
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
