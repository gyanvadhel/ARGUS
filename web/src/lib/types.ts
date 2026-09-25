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
  /** Positive evidence that the thing is legitimate, 0..1 (e.g. one of the world's most visited sites). */
  trust?: number;
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
  /** True only when positive evidence confirms it's safe, not merely "nothing found". Missing on older scans. */
  verified?: boolean;
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

/** One live threat feed as reported by the engine's /health. */
export interface FeedStatus {
  label: string;
  count: number;
  /** Unix seconds of the last successful download; null until the first one lands. */
  fetched_at: number | null;
  error: string | null;
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
