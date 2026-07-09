import { useEffect, useState } from "react";
import { Activity, Server, Zap, Wifi } from "lucide-react";
import { TelemetryMetrics } from "@/lib/api";

/**
 * Shows measured query timings only: network round-trip is measured in the
 * browser, server processing comes from the backend's X-Process-Time header.
 * If the server header is missing, that row is simply not shown.
 */
export function TelemetryPanel() {
  const [metrics, setMetrics] = useState<TelemetryMetrics | null>(null);

  useEffect(() => {
    const handleTelemetry = (e: Event) => {
      const customEvent = e as CustomEvent<TelemetryMetrics>;
      setMetrics(customEvent.detail);
    };

    window.addEventListener("facevault-telemetry", handleTelemetry);
    return () => window.removeEventListener("facevault-telemetry", handleTelemetry);
  }, []);

  if (!metrics) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 animate-fade-in-up">
      <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-2xl w-80 font-mono text-xs">

        <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
          <div className="flex items-center gap-2 text-emerald-400">
            <Activity className="w-4 h-4 animate-pulse" />
            <span className="font-semibold tracking-wider font-sans text-[11px] uppercase">Query Telemetry</span>
          </div>
          <span className="text-white/40">{new Date(metrics.timestamp).toLocaleTimeString([], { hour12: false })}</span>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center bg-white/5 px-2 py-1.5 rounded">
            <span className="text-white/60 flex items-center gap-1.5"><Server className="w-3 h-3"/> Method</span>
            <span className="text-white/90">{metrics.queryType} ({metrics.facesSearched} face{metrics.facesSearched > 1 ? 's' : ''})</span>
          </div>

          {metrics.searchMs !== undefined && (
            <div className="flex justify-between items-center bg-white/5 px-2 py-1.5 rounded">
              <span className="text-white/60 flex items-center gap-1.5"><Zap className="w-3 h-3"/> Vector Search</span>
              <span className="text-amber-400 font-bold">{metrics.searchMs.toFixed(2)} ms</span>
            </div>
          )}

          {metrics.backendMs !== undefined && (
            <div className="flex justify-between items-center bg-white/5 px-2 py-1.5 rounded">
              <span className="text-white/60 flex items-center gap-1.5"><Server className="w-3 h-3"/> Server Total</span>
              <span className="text-amber-400 font-bold">{metrics.backendMs.toFixed(2)} ms</span>
            </div>
          )}

          <div className="flex justify-between items-center bg-white/5 px-2 py-1.5 rounded">
            <span className="text-white/60 flex items-center gap-1.5"><Wifi className="w-3 h-3"/> Network Round-Trip</span>
            <span className="text-blue-400 font-bold">{metrics.networkRtt.toFixed(2)} ms</span>
          </div>
        </div>

      </div>
    </div>
  );
}
