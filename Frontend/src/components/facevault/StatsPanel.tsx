import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchResponse } from '@/types/facevault';
import { BarChart3 } from 'lucide-react';

interface StatsPanelProps {
  response: SearchResponse;
  queryTime?: number;
}

export function StatsPanel({ response, queryTime = 3.2 }: StatsPanelProps) {
  const { results, cluster } = response;

  const stats = [
    {
      label: 'Images Returned',
      value: results.length.toString(),
    },
    {
      label: 'Cluster Mean Similarity',
      value: cluster.centroid_similarity.toFixed(3),
    },
    {
      label: 'Threshold Used',
      value: cluster.threshold_used.toString(),
    },
    {
      label: 'Query Time',
      value: `${queryTime.toFixed(1)}s`,
    },
  ];

  return (
    <Card className="animate-fade-in">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-display flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Query Statistics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {stats.map((stat) => (
            <div 
              key={stat.label}
              className="flex items-center justify-between py-2 border-b border-border last:border-0"
            >
              <span className="text-sm text-muted-foreground">{stat.label}</span>
              <span className="font-mono text-sm font-medium">{stat.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
