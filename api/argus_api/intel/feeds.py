"""Live, keyless threat feeds: downloaded, cached on disk, and refreshed in the background.

- URLhaus (abuse.ch): links actively spreading malware right now
- OpenPhish: phishing pages that are live right now
- Phishing.Database: hundreds of thousands of active phishing domains
- Tranco: the world's most visited sites, used as positive evidence and for look-alike detection

Lookups are in-memory set/dict hits, so checking a link against every feed costs microseconds.
"""
from __future__ import annotations

import io
import json
import logging
import os
import threading
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from urllib.parse import urlsplit

import httpx

log = logging.getLogger("argus.feeds")

CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache" / "feeds"
MAX_AGE_SECONDS = 6 * 3600
TRANCO_LIMIT = 200_000
TOP_FOR_LOOKALIKES = 10_000


@dataclass(frozen=True)
class FeedSpec:
    key: str
    label: str
    url: str
    kind: str  # "urls" | "domains" | "tranco"
    filename: str


FEEDS = [
    FeedSpec("urlhaus", "URLhaus live malware links", "https://urlhaus.abuse.ch/downloads/text_online/", "urls", "urlhaus.txt"),
    FeedSpec("openphish", "OpenPhish live phishing links", "https://openphish.com/feed.txt", "urls", "openphish.txt"),
    FeedSpec(
        "phishing_db",
        "Phishing.Database active phishing domains",
        "https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt",
        "domains",
        "phishing-db.txt",
    ),
    FeedSpec("tranco", "Tranco most visited sites", "https://tranco-list.eu/top-1m.csv.zip", "tranco", "tranco.zip"),
]


def normalize_feed_url(raw: str) -> str:
    """Scheme-less, lower-cased host, no default port, no trailing slash, no fragment: http/https variants match."""
    parts = urlsplit(raw.strip() if "://" in raw else "http://" + raw.strip())
    host = (parts.hostname or "").lower().rstrip(".")
    port = parts.port
    netloc = host if port in (None, 80, 443) else f"{host}:{port}"
    path = parts.path.rstrip("/")
    query = f"?{parts.query}" if parts.query else ""
    return f"{netloc}{path}{query}"


def host_key(url_key: str) -> str:
    return url_key.split("/", 1)[0].split("?", 1)[0]


def parse_url_list(text: str) -> tuple[set[str], set[str]]:
    urls: set[str] = set()
    hosts: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            key = normalize_feed_url(line)
        except ValueError:
            continue
        if key:
            urls.add(key)
            hosts.add(host_key(key))
    return urls, hosts


def parse_domain_list(text: str) -> set[str]:
    return {line.strip().lower().rstrip(".") for line in text.splitlines() if line.strip() and not line.startswith("#")}


def parse_tranco_zip(data: bytes, limit: int = TRANCO_LIMIT) -> dict[str, int]:
    ranks: dict[str, int] = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        name = next(n for n in archive.namelist() if n.endswith(".csv"))
        with archive.open(name) as fh:
            for raw in io.TextIOWrapper(fh, encoding="utf-8"):
                rank_text, _, domain = raw.strip().partition(",")
                if not domain:
                    continue
                ranks[domain.lower()] = int(rank_text)
                if len(ranks) >= limit:
                    break
    return ranks


def _http_fetch(url: str) -> bytes:
    with httpx.Client(timeout=90, follow_redirects=True, headers={"User-Agent": "ARGUS-Scanner/1.0 (+threat-feed sync)"}) as c:
        r = c.get(url)
        r.raise_for_status()
        return r.content


class FeedStore:
    def __init__(self, cache_dir: Path = CACHE_DIR, fetch: Callable[[str], bytes] | None = None):
        self.cache_dir = Path(cache_dir)
        self._fetch = fetch or _http_fetch
        self._lock = threading.Lock()
        self._urls: dict[str, set[str]] = {}
        self._hosts: dict[str, set[str]] = {}
        self._domains: set[str] = set()
        self._ranks: dict[str, int] = {}
        self.top_domains: list[str] = []
        self._meta: dict[str, dict] = {spec.key: {"label": spec.label, "count": 0, "fetched_at": None, "error": None} for spec in FEEDS}
        self._started = False

    # --- loading ---------------------------------------------------------------------
    def _install(self, spec: FeedSpec, data: bytes, fetched_at: float) -> None:
        if spec.kind == "urls":
            urls, hosts = parse_url_list(data.decode("utf-8", errors="ignore"))
            with self._lock:
                self._urls[spec.key], self._hosts[spec.key] = urls, hosts
            count = len(urls)
        elif spec.kind == "domains":
            domains = parse_domain_list(data.decode("utf-8", errors="ignore"))
            with self._lock:
                self._domains = domains
            count = len(domains)
        else:
            ranks = parse_tranco_zip(data)
            top = [d for d, r in sorted(ranks.items(), key=lambda kv: kv[1])[:TOP_FOR_LOOKALIKES]]
            with self._lock:
                self._ranks, self.top_domains = ranks, top
            count = len(ranks)
        self._meta[spec.key].update(count=count, fetched_at=fetched_at, error=None)

    def _cache_path(self, spec: FeedSpec) -> Path:
        return self.cache_dir / spec.filename

    def _stamps(self) -> dict[str, float]:
        try:
            return json.loads((self.cache_dir / "fetched.json").read_text())
        except (OSError, ValueError):
            return {}

    def load_from_cache(self) -> None:
        stamps = self._stamps()
        for spec in FEEDS:
            path = self._cache_path(spec)
            if path.exists():
                try:
                    self._install(spec, path.read_bytes(), stamps.get(spec.key, path.stat().st_mtime))
                except Exception as exc:  # noqa: BLE001 - a corrupt cache file just means "download again"
                    self._meta[spec.key]["error"] = f"cache unreadable: {exc}"

    def refresh(self, force: bool = False) -> None:
        stamps = self._stamps()
        for spec in FEEDS:
            fetched = self._meta[spec.key]["fetched_at"] or stamps.get(spec.key)
            if not force and fetched and time.time() - fetched < MAX_AGE_SECONDS and self.loaded(spec.key):
                continue
            try:
                data = self._fetch(spec.url)
                now = time.time()
                self._install(spec, data, now)
                self.cache_dir.mkdir(parents=True, exist_ok=True)
                tmp = self._cache_path(spec).with_suffix(".tmp")
                tmp.write_bytes(data)
                os.replace(tmp, self._cache_path(spec))
                stamps[spec.key] = now
                (self.cache_dir / "fetched.json").write_text(json.dumps(stamps))
                log.info("feed %s refreshed: %s entries", spec.key, self._meta[spec.key]["count"])
            except Exception as exc:  # noqa: BLE001 - keep serving whatever we already have
                self._meta[spec.key]["error"] = f"{type(exc).__name__}: {exc}"[:200]
                log.warning("feed %s refresh failed: %s", spec.key, exc)

    def start(self) -> None:
        """Serve from the disk cache immediately, then keep feeds fresh in a background thread."""
        if self._started:
            return
        self._started = True
        self.load_from_cache()

        def loop() -> None:
            while True:
                self.refresh()
                time.sleep(1800)

        threading.Thread(target=loop, name="argus-feeds", daemon=True).start()

    # --- lookups ---------------------------------------------------------------------
    def loaded(self, key: str) -> bool:
        return self._meta[key]["fetched_at"] is not None

    def url_hit(self, key: str, url: str) -> str | None:
        """'url' if this exact link is listed, 'host' if other links on the same host are, else None."""
        try:
            normalized = normalize_feed_url(url)
        except ValueError:
            return None
        without_query = normalized.split("?", 1)[0]
        urls = self._urls.get(key, set())
        if normalized in urls or without_query in urls:
            return "url"
        if host_key(normalized) in self._hosts.get(key, set()):
            return "host"
        return None

    def domain_listed(self, host: str, registrable: str | None) -> bool:
        """Exact host, or its registrable domain. Callers pass None for shared platforms (blogspot.com etc.)."""
        return host in self._domains or (registrable is not None and registrable in self._domains)

    def rank(self, domain: str) -> int | None:
        return self._ranks.get(domain)

    def count(self, key: str) -> int:
        return self._meta[key]["count"]

    def status(self) -> dict[str, dict]:
        return {k: dict(v) for k, v in self._meta.items()}


store = FeedStore()
