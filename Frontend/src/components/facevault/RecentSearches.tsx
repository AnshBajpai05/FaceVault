import { useEffect, useState } from "react";
import { getRecentSearches } from "@/lib/api";
import { Clock, CheckCircle2, AlertTriangle, XCircle, Search } from "lucide-react";

interface RecentItem {
  timestamp: string;
  status: string;
  strong_ratio: number;
  identity: string | null;
}

// Time formatter
function timeAgo(ts: string) {
  let dateTs = ts;
  if (dateTs && !dateTs.endsWith("Z")) {
    dateTs = dateTs + "Z";
  }
  const d = new Date(dateTs);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} mins ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hours ago`;

  const days = Math.floor(hrs / 24);
  return `${days} days ago`;
}

function StatusBadge({ status }: { status: string }) {
  let Icon = CheckCircle2;
  let colorClass = "";
  let label = status;

  switch (status) {
    case "accepted":
      Icon = CheckCircle2;
      colorClass = "bg-status-success-bg text-status-success-foreground border-status-success/20";
      label = "Accepted";
      break;
    case "ambiguous":
      Icon = AlertTriangle;
      colorClass = "bg-status-warning-bg text-status-warning-foreground border-status-warning/20";
      label = "Ambiguous";
      break;
    case "gray_zone":
      Icon = AlertTriangle;
      colorClass = "bg-status-caution-bg text-status-caution-foreground border-status-caution/20";
      label = "Low Confidence";
      break;
    case "new_identity":
      Icon = XCircle;
      colorClass = "bg-status-error-bg text-status-error-foreground border-status-error/20";
      label = "No Match";
      break;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${colorClass}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export function RecentSearches() {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRecentSearches()
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="card-elevated animate-fade-in flex flex-col h-full overflow-hidden">
      <div className="p-5 border-b border-border/50 bg-gradient-to-r from-background/50 to-transparent flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Clock className="h-4 w-4 text-primary" />
        </div>
        <h3 className="font-display text-lg font-medium tracking-tight">Recent Activity</h3>
      </div>

      <div className="p-0 overflow-x-auto flex-1">
        {loading ? (
          <div className="p-8 flex justify-center text-muted-foreground animate-pulse gap-2">
            <Search className="h-4 w-4" /> Fetching recent logs...
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
              <Search className="h-5 w-5 opacity-50" />
            </div>
            <p>No recent searches found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Time</th>
                <th className="px-5 py-3 text-left font-medium">Identity</th>
                <th className="px-5 py-3 text-left font-medium">Strong Matches</th>
                <th className="px-5 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {items.map((r, i) => (
                <tr key={i} className="hover:bg-primary/5 transition-colors group">
                  <td className="px-5 py-4 whitespace-nowrap text-muted-foreground group-hover:text-foreground transition-colors relative">
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    {timeAgo(r.timestamp)}
                  </td>
                  <td className="px-5 py-4 font-mono font-medium text-foreground">
                    {r.identity ?? <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{Math.round(r.strong_ratio * 100)}%</span>
                      <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.round(r.strong_ratio * 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
