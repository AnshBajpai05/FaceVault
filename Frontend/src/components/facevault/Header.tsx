import { Fingerprint } from 'lucide-react';

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

        {/* Status indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-xs font-medium text-white/90">System Active</span>
        </div>
      </div>
    </header>
  );
}
