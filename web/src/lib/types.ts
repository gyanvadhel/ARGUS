export type SignalStatus = "clean" | "suspicious" | "malicious" | "unknown" | "unavailable" | "error";
export type ScanKind = "url" | "file" | "email" | "phone" | "text" | "call";
export type RiskLevel = "SAFE" | "LOW/MODERATE" | "SUSPICIOUS" | "HIGH RISK" | "UNVERIFIED";

export interface Signal {
  source: string;
  status: SignalStatus;
  score: number;
  weight: number;
  summary: string;
  authoritative: boolean;
  evidence: Record<string, unknown>;
}

export interface Verdict {
  kind: ScanKind;
  subject: string;
  score: number;
  level: RiskLevel;
  threat_type: string;
  signals: Signal[];
  recommendation: string;
  scanned_at: string;
}

export interface ScanRow {
  id: string;
  kind: ScanKind;
  input_preview: string;
  score: number;
  level: RiskLevel;
  threat_type: string;
  verdict: Verdict;
  created_at: string;
}

export interface CallTurn { role: "caller" | "assistant"; text: string }
export interface CallTurnResponse { reply: string; mode: string; analysis: Verdict }
