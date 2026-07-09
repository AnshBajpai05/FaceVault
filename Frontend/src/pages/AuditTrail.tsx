import { useEffect, useState } from "react";
import { Header } from "@/components/facevault/Header";
import { getAuditLogs, clearAuditLogs, AuditRecord } from "@/lib/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, ArrowLeft, Download, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function AuditTrail() {
  const [logs, setLogs] = useState<AuditRecord[]>([]);

  useEffect(() => {
    setLogs(getAuditLogs());
  }, []);

  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facevault_audit_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleClear = () => {
    if (!window.confirm("Clear all local audit logs? This cannot be undone.")) return;
    clearAuditLogs();
    setLogs([]);
  };

  const renderBadge = (action: string) => {
    switch (action) {
      case "promote":
        return <span className="px-2.5 py-1 rounded bg-status-success/20 text-status-success border border-status-success/30 text-[10px] font-bold uppercase tracking-wider">HITL Rescue</span>;
      case "reject_false_positive":
        return <span className="px-2.5 py-1 rounded bg-status-error/20 text-status-error border border-status-error/30 text-[10px] font-bold uppercase tracking-wider">False Positive</span>;
      case "download":
        return <span className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold uppercase tracking-wider">Data Extract</span>;
      case "search":
        return <span className="px-2.5 py-1 rounded bg-primary/20 text-primary border border-primary/30 text-[10px] font-bold uppercase tracking-wider">Query Execution</span>;
      default:
        return <span className="px-2.5 py-1 rounded bg-muted text-muted-foreground border border-border text-[10px] font-bold uppercase tracking-wider">{action}</span>;
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-6xl animate-fade-in-up">
        
        <div className="flex items-center gap-4 mb-8">
          <Link to="/">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-display font-semibold flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-emerald-400" />
              Audit Trail
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Local log of searches, downloads, and human-in-the-loop corrections (stored in this browser; corrections also sync to the backend feedback log).
            </p>
          </div>
        </div>

        <Card className="card-elevated border-border/50 bg-black/20 backdrop-blur-xl">
          <CardHeader className="border-b border-border/50 bg-primary/5 pb-4">
            <CardTitle className="text-lg font-medium flex justify-between items-center flex-wrap gap-2">
              <span>Local Audit Log</span>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground font-mono">{logs.length} EVENTS</span>
                <Button variant="outline" size="sm" onClick={exportLogs} disabled={logs.length === 0} className="gap-1.5 h-8">
                  <Download className="w-3.5 h-3.5" />
                  Export JSON
                </Button>
                <Button variant="outline" size="sm" onClick={handleClear} disabled={logs.length === 0} className="gap-1.5 h-8 hover:bg-destructive hover:text-destructive-foreground">
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {logs.length === 0 ? (
              <div className="py-24 flex flex-col items-center justify-center text-center opacity-70">
                <ShieldAlert className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-xl font-medium mb-2 w-max">No Auditable Events Recorded</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Execute searches or perform manual overrides in the results grid to populate the compliance ledger.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-muted/40 border-b border-border/50 text-muted-foreground uppercase text-[10px] tracking-widest">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Event ID</th>
                      <th className="px-6 py-4 font-semibold">UTC Timestamp</th>
                      <th className="px-6 py-4 font-semibold">Classification</th>
                      <th className="px-6 py-4 font-semibold">Face ID</th>
                      <th className="px-6 py-4 font-semibold">Threshold</th>
                      <th className="px-6 py-4 font-semibold min-w-[300px]">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/20 transition-colors group">
                        <td className="px-6 py-3.5 font-mono text-xs text-muted-foreground group-hover:text-primary transition-colors">
                          {log.id}
                        </td>
                        <td className="px-6 py-3.5 font-mono text-xs text-muted-foreground">
                          {new Date(log.timestamp).toISOString().replace("T", " ").substring(0, 19)}
                        </td>
                        <td className="px-6 py-3.5">
                          {renderBadge(log.action)}
                        </td>
                        <td className="px-6 py-3.5 font-mono text-xs text-foreground/80">
                          {log.face_id ? log.face_id : <span className="text-muted-foreground/50">N/A</span>}
                        </td>
                        <td className="px-6 py-3.5 font-mono text-xs text-amber-400/90 font-medium">
                          {log.threshold ? `>= ${(log.threshold * 100).toFixed(1)}%` : <span className="text-muted-foreground/50">N/A</span>}
                        </td>
                        <td className="px-6 py-3.5 text-foreground/90 font-sans">
                          {log.details}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
