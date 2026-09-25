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

/** What ARGUS users collectively know about a phone number. */
export interface Community {
  reports: number;
  categories: Record<string, number>;
  name: string | null;
  name_votes: number;
  last_report_days: number | null;
  sightings: number;
}

export interface CommunityReport {
  category: string;
  name_tag: string | null;
  note?: string | null;
  created_at: string;
}
