"""File analysis: local inspection + VirusTotal + MalwareBazaar (hash lookups, the file never leaves the server)."""
from __future__ import annotations

import asyncio
import hashlib

import httpx

from argus_api import config
from argus_api.aggregate import combine
from argus_api.checkers.text import ml_signal
from argus_api.checkers.vt import VT_BASE, vt_stats_signal
from argus_api.http import guarded, make_client, unavailable
from argus_api.models import Signal, Verdict

MAX_FILE_BYTES = 32 * 1024 * 1024
MALWAREBAZAAR_URL = "https://mb-api.abuse.ch/api/v1/"

# Stored reversed so antivirus software doesn't quarantine this file or its .pyc.
_EICAR_REVERSED = "*H+H$!ELIF-TSET-SURIVITNA-DRADNATS-RACIE$}7)CC7)^P(45XZP\\4[PA@%P!O5X"

DANGEROUS_EXT = {"exe", "scr", "bat", "cmd", "com", "pif", "vbs", "vbe", "js", "jse", "wsf", "ps1",
                 "msi", "jar", "hta", "lnk", "dll", "iso", "img"}
DECOY_EXT = {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "jpg", "jpeg", "png", "gif", "txt", "mp3", "mp4", "zip"}
EXECUTABLE_EXT = {"exe", "dll", "scr", "msi", "com", "sys"}


def eicar_bytes() -> bytes:
    return "".join(reversed(_EICAR_REVERSED)).encode("ascii")


def _as_text(data: bytes) -> str | None:
    sample = data[:20000]
    if b"\x00" in sample:
        return None
    try:
        text = sample.decode("utf-8")
    except UnicodeDecodeError:
        return None
    if not text:
        return None
    printable = sum(ch.isprintable() or ch in "\r\n\t" for ch in text)
    return text if printable / len(text) > 0.9 else None


def local_file_signal(filename: str, data: bytes) -> Signal:
    name = (filename or "upload").lower()
    parts = name.split(".")
    ext = parts[-1] if len(parts) > 1 else ""
    evidence = {"sha256": hashlib.sha256(data).hexdigest(), "size_bytes": len(data), "filename": filename}

    if eicar_bytes() in data[:256]:
        return Signal(source="ARGUS file inspection", status="malicious", score=100, weight=1.5, authoritative=True,
                      summary="Matches the EICAR antivirus test signature",
                      evidence={**evidence, "reasons": ["EICAR standard antivirus test file"],
                                "threat_type": "Test malware (EICAR)"})

    points = 0
    reasons: list[str] = []
    if len(parts) >= 3 and ext in DANGEROUS_EXT and parts[-2] in DECOY_EXT:
        points += 60
        reasons.append(f"Disguised as .{parts[-2]} but is actually a .{ext} program")
    elif ext in DANGEROUS_EXT:
        points += 25
        reasons.append(f".{ext} files can run code on your computer")
    if data[:2] == b"MZ" and ext not in EXECUTABLE_EXT:
        points += 50
        reasons.append(f"Contains a Windows program hidden inside a .{ext or 'unknown'} file")
    if data[:4] == b"PK\x03\x04" and b"vbaProject.bin" in data:
        points += 35
        reasons.append("Contains Office macros")
    if data[:4] == b"%PDF" and (b"/JavaScript" in data or b"/OpenAction" in data):
        points += 25
        reasons.append("PDF contains auto-running scripts")

    score = min(points, 100)
    return Signal(source="ARGUS file inspection", status="suspicious" if score >= 30 else "clean", score=score,
                  weight=1.0, summary=reasons[0] if reasons else "No risky file traits found",
                  evidence={**evidence, "reasons": reasons, "threat_type": "Malware" if score >= 30 else "None"})


async def virustotal_file(client: httpx.AsyncClient, sha256: str) -> Signal:
    key = config.key("VIRUSTOTAL_API_KEY")
    if not key:
        return unavailable("VirusTotal", "VIRUSTOTAL_API_KEY")
    r = await client.get(f"{VT_BASE}/files/{sha256}", headers={"x-apikey": key})
    if r.status_code == 404:
        return Signal(source="VirusTotal", status="unknown", score=0, weight=0, summary="VirusTotal has never seen this file")
    r.raise_for_status()
    attrs = r.json()["data"]["attributes"]
    label = (attrs.get("popular_threat_classification") or {}).get("suggested_threat_label")
    return vt_stats_signal("VirusTotal", attrs.get("last_analysis_stats") or {}, "file",
                           {"threat_type": label} if label else None)


async def malwarebazaar(client: httpx.AsyncClient, sha256: str) -> Signal:
    key = config.key("ABUSECH_AUTH_KEY")
    if not key:
        return unavailable("MalwareBazaar", "ABUSECH_AUTH_KEY")
    r = await client.post(MALWAREBAZAAR_URL, data={"query": "get_info", "hash": sha256}, headers={"Auth-Key": key})
    r.raise_for_status()
    body = r.json()
    if body.get("query_status") == "ok" and body.get("data"):
        d = body["data"][0]
        name = d.get("signature") or d.get("file_type") or "malware"
        return Signal(source="MalwareBazaar", status="malicious", score=95, weight=1.5, authoritative=True,
                      summary=f"Known malware sample: {name}",
                      evidence={"signature": d.get("signature"), "file_type": d.get("file_type"),
                                "first_seen": d.get("first_seen"), "threat_type": name})
    return Signal(source="MalwareBazaar", status="unknown", score=0, weight=0,
                  summary="Not in MalwareBazaar's malware database")


async def check_file(filename: str, data: bytes) -> Verdict:
    local = local_file_signal(filename, data)
    sha256 = local.evidence["sha256"]
    async with make_client() as client:
        remote = await asyncio.gather(
            guarded("VirusTotal", virustotal_file(client, sha256)),
            guarded("MalwareBazaar", malwarebazaar(client, sha256)),
        )
    signals = [local, *remote]
    text = _as_text(data)
    if text:
        signals.append(ml_signal(text[:5000]).model_copy(update={"source": "ARGUS ML (file contents)", "weight": 0.5}))
    return combine("file", filename or "upload", signals)
