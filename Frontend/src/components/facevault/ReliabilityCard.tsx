import { Shield, CheckCircle } from 'lucide-react';

export function ReliabilityCard() {
  return (
    <div className="card-elevated p-6 animate-fade-in">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
          <Shield className="h-6 w-6 text-accent" />
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-display font-semibold text-foreground mb-2">
            Reliability & Safety
          </h3>

          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            FaceVault is designed to return <strong className="text-foreground">as many correct
            matches as possible</strong> while still preventing identity-mixing.  
            In large-scale testing (<strong>10,000 searches</strong>), the system achieved:
            <br />
            <strong className="text-foreground">94.6% average precision</strong> and 
            <strong className="text-foreground"> 86.5% average recall</strong>.
            Low-confidence or ambiguous results are clearly grouped so you always
            know what to trust.
          </p>

          <div className="flex flex-wrap gap-3">
            {['High-precision', 'High-recall', 'Clear flagging', 'Identity-safe'].map((feature) => (
              <span
                key={feature}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-accent/10 text-accent"
              >
                <CheckCircle className="h-3 w-3" />
                {feature}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
