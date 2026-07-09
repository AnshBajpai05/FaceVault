import { API_BASE } from "./api";

export type AuditAction = "search" | "promote" | "reject_false_positive" | "download";

export interface AuditRecord {
  id: string;            // unique hash or ID
  timestamp: string;     // ISO format
  action: AuditAction;
  details: string;       // human readable summary
  face_id?: string;
  threshold?: number;
}

const STORAGE_KEY = "facevault_audit_trail";

/**
 * Generates a unique client-side log ID (random suffix + timestamp)
 */
function generateId() {
  return "fv-log-" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

/**
 * Records an audit action in browser local storage and, for human-in-the-loop
 * corrections, syncs it to the backend /feedback endpoint where it is
 * persisted to a JSONL log for later threshold recalibration.
 */
export async function logAuditAction(
  action: AuditAction, 
  details: string, 
  metadata: { face_id?: string, threshold?: number } = {},
  syncWithBackend: boolean = false
) {
  const record: AuditRecord = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    action,
    details,
    ...metadata
  };

  // 1. Commit to Local Audit Ledger
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    const logs: AuditRecord[] = existing ? JSON.parse(existing) : [];
    logs.unshift(record); // newest first
    // keep up to 1000 logs locally
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, 1000)));
  } catch (e) {
    console.error("Audit log critical failure:", e);
  }

  // 2. Synchronize HITL Feedback to Vector Engine Background
  if (syncWithBackend && (action === "promote" || action === "reject_false_positive") && metadata.face_id) {
    try {
      // NOTE: This fires asynchronously and doesn't block the UI
      fetch(`${API_BASE}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action,
          face_id: metadata.face_id,
          threshold_used: metadata.threshold,
          timestamp: record.timestamp
        })
      }).catch(() => {
        // Silent catch for telemetry
      });
    } catch {
      // silent
    }
  }

  return record;
}

export function getAuditLogs(): AuditRecord[] {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    return existing ? JSON.parse(existing) : [];
  } catch {
    return [];
  }
}

export function clearAuditLogs() {
  localStorage.removeItem(STORAGE_KEY);
}
