from argus_api.models import Signal

VT_BASE = "https://www.virustotal.com/api/v3"


def vt_stats_signal(source: str, stats: dict, noun: str, extra: dict | None = None) -> Signal:
    malicious = int(stats.get("malicious", 0))
    suspicious = int(stats.get("suspicious", 0))
    total = sum(int(v) for v in stats.values() if isinstance(v, (int, float)))
    evidence = {"malicious": malicious, "suspicious": suspicious, "total": total, **(extra or {})}
    summary = f"{malicious}/{total} security vendors flag this {noun}"
    if malicious >= 3:
        evidence.setdefault("threat_type", f"Malicious {noun}")
        return Signal(source=source, status="malicious", score=min(100, 70 + malicious), weight=1.5,
                      authoritative=True, summary=summary, evidence=evidence)
    if malicious >= 1 or suspicious >= 2:
        return Signal(source=source, status="suspicious", score=50, weight=1.0, summary=summary, evidence=evidence)
    return Signal(source=source, status="clean", score=0, weight=1.0, summary=summary, evidence=evidence)
