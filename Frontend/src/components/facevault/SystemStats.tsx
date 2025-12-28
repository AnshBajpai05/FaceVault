import { useEffect, useState } from "react";
import { Activity, Target, AlertTriangle, Users } from "lucide-react";
import { API_BASE } from "@/lib/api";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext?: string;
  trend?: "up" | "down" | "neutral";
}

function StatCard({ icon, label, value, subtext, trend }: StatCardProps) {
  return (
    <div className="card-elevated p-5 transition-all duration-300 hover:scale-[1.02]">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          {icon}
        </div>

        {trend && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              trend === "up"
                ? "bg-status-success-bg text-status-success-foreground"
                : trend === "down"
                ? "bg-status-error-bg text-status-error-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "–"}
          </span>
        )}
      </div>

      <p className="text-2xl font-display font-semibold text-foreground mb-1">
        {value}
      </p>

      <p className="text-sm text-muted-foreground">{label}</p>

      {subtext && (
        <p className="text-xs text-muted-foreground/70 mt-1">{subtext}</p>
      )}
    </div>
  );
}

export function SystemStats() {
  const [stats, setStats] = useState<null | {
    total_queries: number;
    avg_precision: number;
    ambiguous_rate: number;
    new_identities: number;
  }>(null);

  useEffect(() => {
    fetch(`${API_BASE}/stats`)
      .then((res) => res.json())
      .then(setStats)
      .catch((err) => console.error("Stats load failed", err));
  }, []);

  // 🟦 nice loading placeholders
  const loading = {
    total_queries: "—",
    avg_precision: "—",
    ambiguous_rate: "—",
    new_identities: "—",
  };

  const values = stats
    ? {
        total_queries: stats.total_queries.toLocaleString(),
        avg_precision: (stats.avg_precision * 100).toFixed(1) + "%",
        ambiguous_rate: stats.ambiguous_rate.toFixed(1) + "%",
        new_identities: stats.new_identities.toString(),
      }
    : loading;

  const cards = [
    {
      icon: <Activity className="h-5 w-5 text-primary" />,
      label: "Total Queries",
      value: values.total_queries,
      subtext: "Last 30 days",
      trend: "up" as const,
    },
    {
      icon: <Target className="h-5 w-5 text-primary" />,
      label: "Avg Precision",
      value: values.avg_precision,
      subtext: "Across all searches",
      trend: "up" as const,
    },
    {
      icon: <AlertTriangle className="h-5 w-5 text-primary" />,
      label: "Ambiguous Rate",
      value: values.ambiguous_rate,
      subtext: "Flagged for review",
      trend: "down" as const,
    },
    {
      icon: <Users className="h-5 w-5 text-primary" />,
      label: "Identities",
      value: values.new_identities,
      subtext: "New this month",
      trend: "neutral" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => (
        <div
          key={card.label}
          className="animate-fade-in-up"
          style={{ animationDelay: `${idx * 100}ms` }}
        >
          <StatCard {...card} />
        </div>
      ))}
    </div>
  );
}
