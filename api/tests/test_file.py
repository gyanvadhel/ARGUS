import hashlib
from pathlib import Path

import respx

from argus_api.checkers import file as f

EICAR_SHA256 = "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f"


def test_eicar_constant_is_correct():
    assert hashlib.sha256(f.eicar_bytes()).hexdigest() == EICAR_SHA256


def test_eicar_not_stored_contiguously():
    needle = "".join(reversed("ELIF-TSET-SURIVITNA-DRADNATS-RACIE"))
    assert needle not in Path(f.__file__).read_text(encoding="utf-8")


def test_local_detects_eicar():
    s = f.local_file_signal("test.txt", f.eicar_bytes())
    assert (s.status, s.score, s.authoritative) == ("malicious", 100, True)


def test_disguised_extension():
    assert f.local_file_signal("invoice.pdf.exe", b"MZ\x90\x00").score >= 60


def test_windows_program_hidden_in_pdf():
    assert f.local_file_signal("report.pdf", b"MZ" + b"\x00" * 100).score >= 50


def test_office_macros():
    assert f.local_file_signal("doc.docm", b"PK\x03\x04....word/vbaProject.bin....").score >= 35


def test_plain_text_is_clean():
    s = f.local_file_signal("notes.txt", b"hello world")
    assert s.status == "clean"
    assert s.evidence["sha256"] == hashlib.sha256(b"hello world").hexdigest()


async def test_virustotal_file_hit(monkeypatch):
    monkeypatch.setenv("VIRUSTOTAL_API_KEY", "k")
    stats = {"malicious": 62, "suspicious": 0, "undetected": 8, "harmless": 0}
    attrs = {"last_analysis_stats": stats, "popular_threat_classification": {"suggested_threat_label": "eicar/test"}}
    with respx.mock:
        respx.get(f"https://www.virustotal.com/api/v3/files/{EICAR_SHA256}").respond(json={"data": {"attributes": attrs}})
        async with f.make_client() as c:
            s = await f.virustotal_file(c, EICAR_SHA256)
    assert s.status == "malicious" and "62/70" in s.summary
    assert s.evidence["threat_type"] == "eicar/test"


async def test_malwarebazaar_not_found_is_unknown(monkeypatch):
    monkeypatch.setenv("ABUSECH_AUTH_KEY", "k")
    with respx.mock:
        respx.post("https://mb-api.abuse.ch/api/v1/").respond(json={"query_status": "hash_not_found"})
        async with f.make_client() as c:
            s = await f.malwarebazaar(c, "0" * 64)
    assert s.status == "unknown"


async def test_binary_file_skips_text_model():
    v = await f.check_file("blob.bin", bytes(range(256)) * 100)
    assert v.kind == "file"
    assert all(s.source != "ARGUS ML (file contents)" for s in v.signals)


async def test_eicar_file_is_high_risk_without_any_keys():
    v = await f.check_file("eicar.com", f.eicar_bytes())
    assert v.level == "HIGH RISK"
