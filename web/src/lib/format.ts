import { FileText, Globe, Mail, MessageSquareText, Phone, PhoneCall, type LucideIcon } from "lucide-react";
import type { RiskLevel, ScanKind, SignalStatus } from "./types";

export const LEVEL_META: Record<RiskLevel, { label: string; color: string }> = {
  SAFE: { label: "Safe", color: "var(--risk-safe)" },
  "LOW/MODERATE": { label: "Low risk", color: "var(--risk-low)" },
  SUSPICIOUS: { label: "Suspicious", color: "var(--risk-sus)" },
  "HIGH RISK": { label: "High risk", color: "var(--risk-high)" },
  UNVERIFIED: { label: "Unverified", color: "var(--risk-unknown)" },
};

const NO_RED_FLAGS = { label: "No red flags", color: "var(--risk-clear)" };

/** "Safe" needs positive evidence (e.g. one of the world's most visited sites); otherwise it's only "no red flags". */
export function levelMeta(level: RiskLevel, verified?: boolean): { label: string; color: string } {
  if (level === "SAFE" && !verified) return NO_RED_FLAGS;
  return LEVEL_META[level] ?? LEVEL_META.UNVERIFIED;
}

export const STATUS_META: Record<SignalStatus, { label: string; color: string }> = {
  malicious: { label: "Malicious", color: "var(--risk-high)" },
  suspicious: { label: "Suspicious", color: "var(--risk-sus)" },
  clean: { label: "Clean", color: "var(--risk-safe)" },
  unknown: { label: "Inconclusive", color: "var(--risk-unknown)" },
  unavailable: { label: "Unavailable", color: "var(--risk-unknown)" },
  error: { label: "Unreachable", color: "var(--risk-unknown)" },
};

export const STATUS_ORDER: SignalStatus[] = ["malicious", "suspicious", "clean", "unknown", "unavailable", "error"];

export const KIND_META: Record<ScanKind, { label: string; icon: LucideIcon }> = {
  url: { label: "Link", icon: Globe },
  file: { label: "File", icon: FileText },
  email: { label: "Email", icon: Mail },
  phone: { label: "Phone", icon: Phone },
  text: { label: "Message", icon: MessageSquareText },
  call: { label: "Call", icon: PhoneCall },
};

export function levelFor(score: number): RiskLevel {
  if (score >= 80) return "HIGH RISK";
  if (score >= 60) return "SUSPICIOUS";
  if (score >= 30) return "LOW/MODERATE";
  return "SAFE";
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(1, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** The one-line Caller ID verdict shown on the identity card and the incoming-call screen. */
export function callerVerdict(score: number, level: RiskLevel, verified?: boolean): string {
  if (level === "UNVERIFIED") return "No verdict";
  if (score >= 80) return "Likely scam";
  if (score >= 60) return "Suspicious";
  if (score >= 30) return "Be careful";
  return verified ? "Looks safe" : "No red flags";
}
