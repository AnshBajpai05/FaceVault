import { useEffect, useState } from "react";
import { Clock, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { API_BASE } from "@/lib/api";

interface RecentSearch {
  timestamp: string;
  status: "accepted" | "ambiguous" | "gray_zone" | "new_identity";
  precision: number;
  identity: string | null;
}

const statusConfig = {
  accepted: {
    label: "Accepted",
    icon: CheckCircle2,
    className: "bg-status-success-bg text-status-success-foreground",
  },
  ambiguous: {
    label: "Ambiguous",
    icon: AlertTriangle,
    className: "bg-status-warning-bg text-status-warning-foreground",
  },
  gray_zone: {
    label: "Low Conf.",
    icon: AlertTriangle,
    className: "bg-status-caution-bg text-status-caution-foreground",
  },
  new_identity: {
    label: "No Match",
    icon: XCircle,
    className: "bg-status-error-bg text-status-error-foreground",
  },
};


// ⭐ SAFE TIME AGO
function timeAgo(ts: string | null | undefined) {
  if (!ts) return "—";

  // If timestamp has no timezone, assume UTC
  if (!ts.endsWith("Z") && !ts.includes("+")) {
    ts = ts + "Z";
  }

  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";

  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} mins ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hours ago`;

  const days = Math.floor(hrs / 24);
  return `${days} days ago`;
}


export function RecentSearches() {
  const [rows, setRows] = useState<RecentSearch[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/recent-searches`);
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();

        // ⭐ Sort newest → oldest (recommended)
        setRows(
          data.sort(
            (a: RecentSearch, b: RecentSearch) =>
              new Date(b.timestamp).getTime() -
              new Date(a.timestamp).getTime()
          )
        );
      } catch (e) {
        console.error(e);
      }
    }

    load();
  }, []);

  return (
    <div className="card-elevated overflow-hidden animate-fade-in">
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-display font-semibold text-foreground">
            Recent Searches
          </h3>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Your latest identity search queries
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead>Time</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Precision</TableHead>
            <TableHead>Identity</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((s, i) => {
            const cfg = statusConfig[s.status];
            const Icon = cfg?.icon ?? AlertTriangle;

            return (
              <TableRow key={i}>
                <TableCell>{timeAgo(s.timestamp)}</TableCell>

                <TableCell>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${cfg?.className ?? ""}`}>
                    <Icon className="h-3 w-3" />
                    {cfg?.label ?? "Unknown"}
                  </span>
                </TableCell>

                <TableCell className="font-mono">
                  {Math.round(s.precision * 100)}%
                </TableCell>

                <TableCell className="font-mono text-muted-foreground">
                  {s.identity ?? "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
