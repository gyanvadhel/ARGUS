import os
from pathlib import Path

from dotenv import load_dotenv

_API_DIR = Path(__file__).resolve().parents[1]
load_dotenv(_API_DIR / ".env")
load_dotenv(_API_DIR.parent / ".env")

KEY_NAMES = {
    "VirusTotal": "VIRUSTOTAL_API_KEY",
    "Google Safe Browsing": "GOOGLE_SAFE_BROWSING_KEY",
    "abuse.ch (URLhaus + MalwareBazaar)": "ABUSECH_AUTH_KEY",
}


def key(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None


def source_status() -> dict[str, bool]:
    return {label: key(env) is not None for label, env in KEY_NAMES.items()}
