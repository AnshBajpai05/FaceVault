import { useEffect, useState } from 'react';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_BASE } from '@/lib/api';
import { cn } from '@/lib/utils';

interface HealthInfo {
  status: string;
  device: string;
  faces_indexed: number;
  identities: number;
}

/**
 * Live backend status — polls /health so the badge reflects reality
 * instead of a hardcoded "System Active" label.
 */
function HealthBadge() {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) {
          setHealth(data);
          setOffline(false);
        }
      } catch {
        if (!cancelled) {
          setHealth(null);
          setOffline(true);
        }
      }
    };

    check();
    const interval = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const label = offline
    ? 'Backend Offline'
    : health
      ? `Online · ${health.faces_indexed.toLocaleString()} faces`
      : 'Connecting…';

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20"
      title={
        health
          ? `${health.identities.toLocaleString()} identities indexed · running on ${health.device}`
          : 'Backend not reachable'
      }
    >
      <div
        className={cn(
          'w-2 h-2 rounded-full',
          offline ? 'bg-red-400' : health ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'
        )}
      />
      <span className="text-xs font-medium text-white/90">{label}</span>
    </div>
  );
}

export function Header() {
  return (
    <header className="gradient-header sticky top-0 z-50 shadow-md">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
            <Fingerprint className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-display font-semibold text-white">
              FaceVault
            </h1>
            <p className="text-xs text-white/70">
              Identity-consistent face search
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link to="/audit-trail" className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/20 backdrop-blur-sm border border-white/20 transition-all text-white/90">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold">Audit Logs</span>
          </Link>

          <HealthBadge />
        </div>
      </div>
    </header>
  );
}
