"""Link analysis.

Every link is judged on:
  1. the address itself: brand impersonation, bait words, free-hosting platforms, look-alike characters,
     and Argus's own model of what phishing domain names look like (argus_api/ml/phish_link.py)
  2. live threat feeds: URLhaus (malware), OpenPhish (phishing), Phishing.Database (phishing domains)
  3. popularity (Tranco top sites) as positive evidence, and look-alikes of the 10,000 most visited sites
  4. a live check: does the domain exist, is its certificate valid, where do redirects lead, and what the
     page actually does (fake logins, card/code fields, hidden scripts, app downloads)
  5. optional keyed services (VirusTotal, Google Safe Browsing, URLhaus API) and domain age (RDAP)
"""
from __future__ import annotations

import asyncio
import base64
import ipaddress
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx

from argus_api import config
from argus_api.aggregate import combine
from argus_api.checkers.vt import VT_BASE, vt_rate_limited, vt_stats_signal
from argus_api.http import guarded, make_client, unavailable
from argus_api.intel import feeds, netcheck
from argus_api.intel.brands import BRAND_DOMAINS, brand_name, is_official
from argus_api.intel.page import analyze_page
from argus_api.ml import phish_link
from argus_api.models import Signal, Verdict
from argus_api.risk_engine import STRONG_INDICATORS, get_engine

__all__ = ["BRAND_DOMAINS", "brand_name", "check_url", "host_of", "normalize_url", "registrable_domain"]

URLHAUS_URL = "https://urlhaus-api.abuse.ch/v1/url/"
SAFE_BROWSING_URL = "https://safebrowsing.googleapis.com/v4/threatMatches:find"
RDAP_URL = "https://rdap.org/domain/"
LIVE_CHECK_SECONDS = 12

SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "ow.ly", "cutt.ly", "rb.gy", "grabify.link",
              "shorturl.at", "tiny.cc", "buff.ly", "rebrand.ly", "t.ly", "s.id", "v.gd", "shorte.st", "adf.ly"}
RISKY_TLDS = {"zip", "mov", "xyz", "top", "click", "country", "gq", "tk", "ml", "cf", "ga", "work", "support", "rest",
              "cam", "icu", "cyou", "sbs", "cfd", "bond", "buzz", "monster", "quest", "lol", "win", "bid", "loan",
              "men", "party", "review", "date", "stream", "download", "gdn", "kim", "mom", "hair", "beauty"}
# Platforms where anyone can publish a page: their popularity must never vouch for a page hosted on them.
USER_CONTENT = {"blogspot.com", "pages.dev", "workers.dev", "github.io", "web.app", "firebaseapp.com", "netlify.app",
                "vercel.app", "weebly.com", "wixsite.com", "000webhostapp.com", "replit.app", "repl.co", "glitch.me",
                "herokuapp.com", "onrender.com", "ngrok.io", "ngrok-free.app", "ngrok.app", "trycloudflare.com",
                "duckdns.org", "ddns.net", "azurewebsites.net", "appspot.com", "surge.sh", "gitbook.io", "notion.site",
                "webflow.io", "wordpress.com", "godaddysites.com", "mystrikingly.com", "jimdosite.com", "square.site",
                "ipfs.io", "dweb.link", "r2.dev", "b-cdn.net", "myshopify.com", "carrd.co", "framer.app", "yolasite.com",
                "site123.me", "tilda.ws", "firebasestorage.googleapis.com"}
USER_CONTENT_HOSTS = ("sites.google.com", "docs.google.com", "forms.gle", "storage.googleapis.com", "script.google.com")
PHISHING_WORDS = {"login", "logon", "signin", "verify", "verification", "secure", "security", "account", "accounts",
                  "update", "confirm", "wallet", "billing", "support", "recover", "recovery", "unlock", "suspended",
                  "authenticate", "auth", "webscr", "banking", "password", "reset", "validate", "customer", "helpdesk",
                  "claim", "refund", "prize", "bonus", "giftcard", "winner", "alert", "kyc", "reward", "airdrop",
                  "unblock", "invoice", "payment", "office365", "outlook365"}
PATH_WORDS = {"login", "signin", "logon", "verify", "account", "update", "secure", "webscr", "confirm", "password",
              "billing", "wallet", "kyc", "unlock"}
TWO_LEVEL_SUFFIXES = {"co.uk", "org.uk", "ac.uk", "gov.uk", "co.in", "org.in", "gov.in", "ac.in", "net.in", "bank.in",
                      "firm.in", "gen.in", "ind.in", "edu.in", "res.in", "com.au",
                      "co.jp", "ac.jp", "com.br", "co.nz", "com.sg", "com.cn", "co.za", "com.mx", "com.tr", "co.id",
                      "com.ng", "co.ke", "com.pk", "com.bd", "com.vn", "com.ph", "com.my", "com.ar", "com.eg"}
SAFE_BROWSING_TYPES = {"MALWARE": "Malware", "SOCIAL_ENGINEERING": "Phishing",
                       "UNWANTED_SOFTWARE": "Unwanted software", "POTENTIALLY_HARMFUL_APPLICATION": "Harmful app"}
LOCAL_SEVERITY = {"strong": 90, "medium": 60, "weak": 30}
# What a download is, by file extension, and how risky it is to open one from a link.
DOWNLOADS = {
    **dict.fromkeys(("apk", "xapk", "apks"), (70, "an Android app")),
    **dict.fromkeys(("exe", "msi", "scr", "com", "bat", "cmd", "ps1", "dll", "jar"), (70, "a Windows program")),
    **dict.fromkeys(("js", "jse", "vbs", "vbe", "wsf", "hta", "sh"), (70, "a script")),
    **dict.fromkeys(("dmg", "pkg"), (60, "a Mac installer")),
    **dict.fromkeys(("iso", "img", "lnk"), (60, "a disk image or shortcut")),
    **dict.fromkeys(("zip", "rar", "7z", "gz", "tar"), (40, "an archive")),
}
DOWNLOAD_TYPES = {
    "application/vnd.android.package-archive": (70, "an Android app"),
    **dict.fromkeys(("application/x-msdownload", "application/x-msdos-program", "application/x-dosexec", "application/x-msi",
                     "application/vnd.microsoft.portable-executable", "application/java-archive"), (70, "a Windows program")),
    **dict.fromkeys(("application/x-executable", "application/x-elf", "application/x-sharedlib", "application/x-mach-binary"),
                    (70, "a program")),
    **dict.fromkeys(("application/x-sh", "application/x-shellscript"), (70, "a script")),
    "application/x-apple-diskimage": (60, "a Mac installer"),
    "application/x-iso9660-image": (60, "a disk image or shortcut"),
    **dict.fromkeys(("application/zip", "application/x-zip-compressed", "application/vnd.rar", "application/x-rar-compressed",
                     "application/x-7z-compressed", "application/gzip", "application/x-tar"), (40, "an archive")),
}
# Files a browser just shows or a site loads behind the scenes: opening them isn't a download risk.
WEB_DATA_TYPES = {"application/json", "application/ld+json", "application/javascript", "application/x-javascript",
                  "application/xml", "application/rss+xml", "application/atom+xml", "application/pdf",
                  "application/manifest+json", "application/wasm"}
_LOOKALIKES = [str.maketrans({"0": "o", "1": "l", "3": "e", "5": "s", "4": "a"}),
               str.maketrans({"0": "o", "1": "i", "3": "e", "5": "s", "4": "a"})]
_HOMOGLYPHS = str.maketrans({"0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b"})
_CONSONANT_RUN = re.compile(r"[bcdfghjklmnpqrstvwxz]{6,}")
AFTER = "After redirect: "


# --- addresses ------------------------------------------------------------------------------------
def normalize_url(raw: str) -> str:
    s = raw.strip()
    return s if re.match(r"^[a-z][a-z0-9+.-]*://", s, re.I) else "https://" + s


def host_of(url: str) -> str:
    return (urlparse(normalize_url(url)).hostname or "").lower().rstrip(".")


def registrable_domain(host: str) -> str:
    parts = host.split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in TWO_LEVEL_SUFFIXES:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _is_ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def _is_official(host: str, domains: tuple[str, ...]) -> bool:
    return any(host == d or host.endswith("." + d) for d in domains)


def _brand_hits(host: str) -> list[str]:
    tokens = re.split(r"[.\-]", host)
    return [b for b in BRAND_DOMAINS if any(t == b or (len(b) >= 6 and t.startswith(b)) for t in tokens)]


def platform_of(host: str) -> str | None:
    """The publish-anything platform a page lives on (e.g. pages.dev), if any."""
    for special in USER_CONTENT_HOSTS:
        if host == special or host.endswith("." + special):
            return special
    reg = registrable_domain(host)
    if reg in USER_CONTENT and host not in (reg, "www." + reg):
        return reg
    return next((p for p in USER_CONTENT if p.count(".") >= 2 and host.endswith("." + p)), None)


def _looks_random(label: str) -> bool:
    """Machine-generated names: digits sprinkled through letters, long consonant runs, almost no vowels."""
    letters = sum(ch.isalpha() for ch in label)
    if len(label) < 8 or not letters:
        return False
    switches = sum(1 for a, b in zip(label, label[1:]) if a.isdigit() != b.isdigit())
    vowels = sum(ch in "aeiouy" for ch in label)
    return switches >= 3 or bool(_CONSONANT_RUN.search(label)) or (len(label) >= 10 and vowels / letters < 0.15)


def heuristics(url: str) -> Signal:
    parsed = urlparse(url)
    host = host_of(url)
    points = 0
    reasons: list[str] = []
    threat = None

    def flag(n: int, why: str) -> None:
        nonlocal points
        points += n
        reasons.append(why)

    official = any(is_official(host, b) for b in BRAND_DOMAINS)
    # Well-known sites legitimately use words like "login" and "secure", so address wording only counts elsewhere.
    known = official or (site_rank(host) or 10**9) <= 100_000
    if _is_ip(host):
        flag(35, "Uses a raw IP address instead of a domain name")
    if "@" in parsed.netloc:
        flag(30, "Hides the real destination behind an '@' in the address")
    if "xn--" in host:
        flag(30, "Uses look-alike international characters (punycode)")
    for brand in [] if known else _brand_hits(host):  # a top site carrying a brand's name is the brand's own
        if not is_official(host, brand):
            flag(40, f"Mentions {brand_name(brand)} but isn't an official {brand_name(brand)} domain")
            threat = "Phishing"
    if not known:
        embedded = next((d for domains in BRAND_DOMAINS.values() for d in domains if f"{d}." in host), None)
        if embedded:
            flag(25, f"Puts {embedded} in the address to look official, but the site is really {registrable_domain(host)}")
            threat = "Phishing"
    if threat is None and not known:
        for table in _LOOKALIKES:
            swapped = host.translate(table)
            if swapped == host:
                continue
            brand = next((b for b in _brand_hits(swapped) if not _is_official(swapped, BRAND_DOMAINS[b])), None)
            if brand:
                flag(45, f"Imitates {brand_name(brand)} by swapping look-alike characters")
                threat = "Phishing"
                break
    platform = platform_of(host)
    if not known:
        words = sorted({t for t in re.split(r"[.\-_]", host) if t in PHISHING_WORDS})
        if words:
            flag(min(36, 12 * len(words)), f"Uses bait words in the address ({', '.join(words)})")
        path_words = sorted({w for w in re.split(r"[/\-_.?=&]", parsed.path.lower()) if w in PATH_WORDS})
        if path_words:
            flag(8, f"Asks you to {path_words[0]} on a little-known site")
        if platform:
            flag(20, f"Hosted on {platform}, where anyone can publish a page")
        label = host.split(".")[0] if platform else registrable_domain(host).split(".")[0]
        if not _is_ip(host) and "xn--" not in host and _looks_random(label.replace("-", "")):
            flag(15, "Random-looking domain name, typical of throwaway scam sites")
    if host in SHORTENERS or registrable_domain(host) in SHORTENERS:
        flag(20, "Link shortener hides the final destination")
    tld = host.rsplit(".", 1)[-1] if "." in host else ""
    if tld in RISKY_TLDS:
        flag(15, f"Uses the .{tld} domain ending, popular with scammers")
    if host.count("-") >= 3 or len(host) > 40:
        flag(10, "Unusually long or hyphen-heavy domain name")
    if host.count(".") >= 4 and not _is_ip(host):
        flag(10, "Buried under many subdomains")
    if parsed.scheme == "http":
        flag(10, "Not encrypted (plain http)")

    score = min(points, 100)
    return Signal(
        source="ARGUS heuristics",
        status="suspicious" if score >= 15 else "clean",
        score=score,
        weight=1.0,
        summary=reasons[0] if reasons else "No suspicious patterns in the address",
        evidence={"reasons": reasons, "host": host, "threat_type": threat or "Suspicious link"},
    )


def local_intel(host: str) -> Signal:
    hits = [e for e in get_engine().threat_intel
            if e["type"] == "domain" and (host == e["indicator"].lower() or host.endswith("." + e["indicator"].lower()))
            and not (e["severity"] == "weak" and e["indicator"].lower() in SHORTENERS)]  # the shortener rule covers these
    if not hits:
        return Signal(source="ARGUS threat intel", status="clean", score=0, weight=0.5, summary="Not on the ARGUS blocklist")
    top = max(hits, key=lambda e: LOCAL_SEVERITY.get(e["severity"], 30))
    score = LOCAL_SEVERITY.get(top["severity"], 30)
    return Signal(
        source="ARGUS threat intel",
        status="malicious" if score >= 60 else "suspicious",
        score=score,
        weight=1.0,
        summary=top["notes"],
        evidence={"indicator": top["indicator"], "category": top["category"], "threat_type": top["category"]},
    )


# --- live threat feeds, popularity and look-alikes -----------------------------------------------
URL_FEEDS = {"urlhaus": "URLhaus live malware feed", "openphish": "OpenPhish live phishing feed"}
MOST_VISITED = 10_000


def is_shortener(host: str) -> bool:
    return host in SHORTENERS or registrable_domain(host) in SHORTENERS


def shared_host(host: str) -> bool:
    """Sites where countless unrelated people post links (github.com, bit.ly, sites.google.com...).
    A bad link there says nothing about the rest, so only exact-link listings count against them."""
    if is_shortener(host) or any(host == h or host.endswith("." + h) for h in USER_CONTENT_HOSTS):
        return True
    reg = registrable_domain(host)
    if reg in USER_CONTENT and host in (reg, "www." + reg):
        return True
    rank = feeds.store.rank(reg) or feeds.store.rank(host)
    return rank is not None and rank <= MOST_VISITED


def feed_signals(url: str, host: str, prefix: str = "") -> list[Signal]:
    store = feeds.store
    shared = shared_host(host)
    known = site_rank(host) is not None  # a real, visited site: a listing more likely means it was hacked
    out: list[Signal] = []
    for key, label in URL_FEEDS.items():
        source = prefix + label
        malware = key == "urlhaus"
        if not store.loaded(key):
            out.append(Signal(source=source, status="unavailable", score=0, weight=0, summary=f"{label} is still downloading"))
            continue
        hit = store.url_hit(key, url)
        if hit == "host" and shared:
            hit = None
        if hit == "url":
            out.append(Signal(source=source, status="malicious", score=96, weight=1.5, authoritative=True,
                              summary=f"This exact link is listed as {'spreading malware' if malware else 'a live phishing page'}",
                              evidence={"threat_type": "Malware distribution" if malware else "Phishing"}))
        elif hit == "host" and not malware and not known:
            out.append(Signal(source=source, status="malicious", score=90, weight=1.5, authoritative=True,
                              summary="This site is hosting live phishing pages", evidence={"threat_type": "Phishing"}))
        elif hit == "host":
            what = "spreading malware" if malware else "phishing pages"
            out.append(Signal(source=source, status="suspicious", score=75 if malware else 70, weight=1.2,
                              summary=f"Other links on this site are {what} right now",
                              evidence={"threat_type": "Malware distribution" if malware else "Phishing"}))
        else:
            out.append(Signal(source=source, status="clean", score=0, weight=0.4,
                              summary=f"Not among {store.count(key):,} live entries"))
    source = prefix + "Phishing.Database"
    if not store.loaded("phishing_db"):
        out.append(Signal(source=source, status="unavailable", score=0, weight=0, summary="Phishing.Database is still downloading"))
    elif not store.domain_listed(host, None if platform_of(host) else registrable_domain(host)):
        out.append(Signal(source=source, status="clean", score=0, weight=0.4,
                          summary=f"Not among {store.count('phishing_db'):,} known phishing domains"))
    elif shared:
        out.append(Signal(source=source, status="unknown", score=0, weight=0,
                          summary="Listed because of pages people published on this shared site; it can't judge this exact link"))
    elif known:
        out.append(Signal(source=source, status="suspicious", score=60, weight=1.0,
                          summary="Listed as a phishing domain, though it's a real site: it may have been hacked",
                          evidence={"threat_type": "Phishing"}))
    else:
        out.append(Signal(source=source, status="malicious", score=92, weight=1.5, authoritative=True,
                          summary="Listed as an active phishing domain", evidence={"threat_type": "Phishing"}))
    return out


def site_rank(host: str) -> int | None:
    """World popularity rank of the site, never of the platform a page is published on."""
    if not host or _is_ip(host) or platform_of(host):
        return None
    return feeds.store.rank(registrable_domain(host)) or feeds.store.rank(host)


def popularity_signal(host: str) -> Signal:
    source = "Site reputation"
    if not feeds.store.loaded("tranco"):
        return Signal(source=source, status="unavailable", score=0, weight=0, summary="The top-sites list is still downloading")
    platform = platform_of(host)
    if platform:
        return Signal(source=source, status="clean", score=0, weight=0.3,
                      summary=f"Published on {platform}: the platform's popularity doesn't vouch for this page")
    if is_shortener(host):
        return Signal(source=source, status="clean", score=0, weight=0.3,
                      summary="A link shortener: its popularity says nothing about where this link leads")
    brand = next((b for b in BRAND_DOMAINS if is_official(host, b)), None)
    if brand:
        return Signal(source=source, status="clean", score=0, weight=0.3, trust=0.9,
                      summary=f"The official {brand_name(brand)} website", evidence={"brand": brand})
    rank = site_rank(host)
    if rank is None:
        return Signal(source=source, status="clean", score=0, weight=0.3, summary="Not among the 200,000 most visited sites")
    trust, what = (0.9, "One of the world's most visited sites") if rank <= MOST_VISITED else \
        (0.6, "A popular site") if rank <= 100_000 else (0.3, "A known site")
    return Signal(source=source, status="clean", score=0, weight=0.3, trust=trust,
                  summary=f"{what} (#{rank:,} worldwide)", evidence={"rank": rank})


def _one_edit_apart(a: str, b: str) -> bool:
    """True when a and b differ by one insert, delete, substitution, or swap of neighbouring letters."""
    if a == b or abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        diffs = [i for i, (x, y) in enumerate(zip(a, b)) if x != y]
        return len(diffs) == 1 or (len(diffs) == 2 and diffs[1] == diffs[0] + 1
                                   and a[diffs[0]] == b[diffs[1]] and a[diffs[1]] == b[diffs[0]])
    short, long_ = (a, b) if len(a) < len(b) else (b, a)
    i = next((k for k, (x, y) in enumerate(zip(short, long_)) if x != y), len(short))
    return short[i:] == long_[i + 1:]


def typosquat_signal(host: str) -> Signal:
    source = "Look-alike check"
    store = feeds.store
    if not store.loaded("tranco"):
        return Signal(source=source, status="unavailable", score=0, weight=0, summary="The top-sites list is still downloading")
    clean = Signal(source=source, status="clean", score=0, weight=0.3, summary="Not a look-alike of a famous site")
    if not host or _is_ip(host) or platform_of(host) or site_rank(host):
        return clean
    reg = registrable_domain(host)
    label = reg.split(".")[0]
    candidates = [label, label.translate(_HOMOGLYPHS).replace("rn", "m").replace("vv", "w")]
    for top in store.top_domains:
        top_label = top.split(".")[0]
        if len(top_label) < 5:
            continue
        for cand in candidates:
            if cand == top_label and label != top_label:
                why = f"Imitates {top} by swapping look-alike characters"
            elif cand == top_label and reg != top:
                why = f"Uses the name {top_label} with a different ending than the real {top}"
            elif _one_edit_apart(cand, top_label):
                why = f"Looks like {top}, one character off"
            else:
                continue
            return Signal(source=source, status="suspicious", score=65 if len(top_label) >= 6 else 50, weight=1.0,
                          summary=why, evidence={"lookalike_of": top, "threat_type": "Look-alike (typosquatting) domain"})
    return clean


# --- live check of the link ------------------------------------------------------------------------
@dataclass
class Live:
    ips: list[str] | None = None
    page: netcheck.PageFetch | None = None
    cert: netcheck.CertInfo | None = None


async def live_check(client: httpx.AsyncClient, url: str, host: str, visit: bool = True) -> Live:
    """DNS and the certificate never touch the link itself; the page is only fetched when visiting is allowed."""
    ips = await netcheck.resolve(host)
    if ips == [] or (ips and not all(netcheck.is_public(ip) for ip in ips)):
        return Live(ips=ips)
    https = urlparse(url).scheme == "https"
    page, cert = await asyncio.gather(
        netcheck.fetch_page(client, url) if visit else asyncio.sleep(0),
        netcheck.certificate(host) if https else asyncio.sleep(0),
        return_exceptions=True,
    )
    return Live(ips=ips,
                page=page if isinstance(page, netcheck.PageFetch) else None,
                cert=cert if isinstance(cert, netcheck.CertInfo) else None)


def dns_signal(ips: list[str] | None) -> Signal:
    source = "Domain check (DNS)"
    if ips is None:
        return Signal(source=source, status="unknown", score=0, weight=0, summary="Couldn't look up the domain right now")
    if ips == []:
        return Signal(source=source, status="suspicious", score=45, weight=1.0,
                      summary="This domain doesn't exist: the link is fake, mistyped, or already taken down",
                      evidence={"threat_type": "Dead or fake link"})
    if not all(netcheck.is_public(ip) for ip in ips):
        return Signal(source=source, status="suspicious", score=50, weight=1.0,
                      summary="The domain points to a private network address",
                      evidence={"ips": ips[:4], "threat_type": "Suspicious redirect"})
    more = f" and {len(ips) - 1} more" if len(ips) > 1 else ""
    return Signal(source=source, status="clean", score=0, weight=0.3,
                  summary=f"The domain is live ({ips[0]}{more})", evidence={"ips": ips[:4]})


def tls_signal(url: str, cert: netcheck.CertInfo | None, page: netcheck.PageFetch | None) -> Signal:
    source = "Security certificate"
    if urlparse(url).scheme != "https":
        return Signal(source=source, status="unknown", score=0, weight=0, summary="Plain http link, so there's no certificate to check")
    error = cert.error if cert and cert.error else None
    if not error and page and page.error and page.error.startswith("certificate"):
        error = page.error.removeprefix("certificate: ")
    if error:
        return Signal(source=source, status="suspicious", score=55, weight=1.0,
                      summary=f"The site's security certificate is invalid ({error[:90]})",
                      evidence={"threat_type": "Invalid certificate"})
    if cert is None or cert.not_before is None:
        return Signal(source=source, status="unknown", score=0, weight=0, summary="Couldn't read the security certificate")
    age = max(0, (datetime.now(timezone.utc) - cert.not_before).days)
    return Signal(source=source, status="clean", score=0, weight=0.3,
                  summary=f"Valid certificate from {cert.issuer or 'a trusted authority'}",
                  evidence={"issuer": cert.issuer, "issued_days_ago": age})


def download_risk(name: str, content_type: str) -> tuple[int, str] | None:
    """How risky a downloaded file is, judged by its name and by what the server says it is (the worse wins)."""
    if content_type in WEB_DATA_TYPES or content_type.startswith(("audio/", "video/", "font/")):
        return None
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    found = [r for r in (DOWNLOADS.get(ext), DOWNLOAD_TYPES.get(content_type)) if r]
    return max(found, key=lambda r: r[0]) if found else (20, "a file")


def page_signals(page: netcheck.PageFetch | None, popular: bool) -> list[Signal]:
    if page is None or page.error in ("offline", "nxdomain"):
        return []
    if page.blocked:
        return [Signal(source="Page content", status="suspicious", score=50, weight=1.0,
                       summary=f"Live check stopped: {page.blocked}", evidence={"threat_type": "Suspicious redirect"})]
    if page.error:
        if page.error.startswith("certificate"):
            return []  # reported by the certificate check
        return [Signal(source="Page content", status="unknown", score=0, weight=0,
                       summary=f"Couldn't load the page ({page.error[:80]})")]
    out: list[Signal] = []
    risk = download_risk(page.download, page.content_type) if page.download else None
    if risk:
        score, what = risk
        out.append(Signal(source="Download check", status="suspicious", score=score, weight=1.0,
                          summary=f"Opening this link downloads {what} ({page.download})",
                          evidence={"file": page.download, "content_type": page.content_type, "threat_type": "Malware download"}))
    if page.html:
        report = analyze_page(page.html, page.final_url, popular=popular)
        lowered = report.text.lower()
        scam_lines = [p for p in STRONG_INDICATORS if p in lowered] if report.score else []
        score = min(100, report.score + 10 * min(3, len(scam_lines)))
        reasons = report.reasons + ([f"Scam wording on the page (\"{scam_lines[0]}\")"] if scam_lines else [])
        title = f": {report.title[:60]}" if report.title else ""
        out.append(Signal(source="Page content",
                          status="malicious" if score >= 80 else "suspicious" if score >= 15 else "clean",
                          score=score, weight=1.0,
                          summary=reasons[0] if reasons else f"The page itself looks ordinary{title}",
                          evidence={"reasons": reasons, "title": report.title, "final_url": page.final_url,
                                    "threat_type": "Phishing page" if report.brand or score >= 60 else "Suspicious page"}))
    return out


def redirect_signal(url: str, page: netcheck.PageFetch | None) -> Signal | None:
    if page is None or len(page.chain) < 2:
        return None
    final_host = host_of(page.final_url)
    if registrable_domain(final_host) == registrable_domain(host_of(url)):
        return None
    chain = [f"{hop.status} {hop.url}" for hop in page.chain][:6]
    if is_popular(final_host):
        return Signal(source="Redirects", status="clean", score=0, weight=0.3,
                      summary=f"Forwards you to {final_host}, a well-known site", evidence={"chain": chain})
    return Signal(source="Redirects", status="suspicious", score=20, weight=0.8,
                  summary=f"Forwards you to a different site: {final_host}",
                  evidence={"chain": chain, "threat_type": "Hidden destination"})


def is_popular(host: str) -> bool:
    rank = site_rank(host)
    return any(is_official(host, b) for b in BRAND_DOMAINS) or (rank is not None and rank <= 100_000)


def _after(signal: Signal) -> Signal:
    return signal.model_copy(update={"source": AFTER + signal.source})


# --- optional keyed services and domain age ---------------------------------------------------------
async def urlhaus(client: httpx.AsyncClient, url: str) -> Signal:
    key = config.key("ABUSECH_AUTH_KEY")
    if not key:
        return unavailable("URLhaus", "ABUSECH_AUTH_KEY")
    r = await client.post(URLHAUS_URL, data={"url": url}, headers={"Auth-Key": key})
    r.raise_for_status()
    body = r.json()
    if body.get("query_status") == "ok":
        threat = (body.get("threat") or "malware").replace("_", " ")
        return Signal(source="URLhaus", status="malicious", score=95, weight=1.5, authoritative=True,
                      summary=f"Listed on URLhaus as {threat} ({body.get('url_status', 'unknown')})",
                      evidence={"threat": threat, "url_status": body.get("url_status"),
                                "tags": body.get("tags") or [], "threat_type": "Malware distribution"})
    return Signal(source="URLhaus", status="clean", score=0, weight=1.0, summary="Not listed on URLhaus")


async def safe_browsing(client: httpx.AsyncClient, url: str) -> Signal:
    key = config.key("GOOGLE_SAFE_BROWSING_KEY")
    if not key:
        return unavailable("Google Safe Browsing", "GOOGLE_SAFE_BROWSING_KEY")
    body = {
        "client": {"clientId": "argus", "clientVersion": "1.0"},
        "threatInfo": {"threatTypes": list(SAFE_BROWSING_TYPES), "platformTypes": ["ANY_PLATFORM"],
                       "threatEntryTypes": ["URL"], "threatEntries": [{"url": url}]},
    }
    r = await client.post(SAFE_BROWSING_URL, params={"key": key}, json=body)
    r.raise_for_status()
    matches = r.json().get("matches") or []
    if matches:
        label = SAFE_BROWSING_TYPES.get(matches[0].get("threatType"), "Unsafe site")
        return Signal(source="Google Safe Browsing", status="malicious", score=95, weight=1.5, authoritative=True,
                      summary=f"Google flags this as {label.lower()}",
                      evidence={"threat_type": label, "matches": [m.get("threatType") for m in matches]})
    return Signal(source="Google Safe Browsing", status="clean", score=0, weight=1.0,
                  summary="Google Safe Browsing has no warnings")


async def virustotal_url(client: httpx.AsyncClient, url: str) -> Signal:
    key = config.key("VIRUSTOTAL_API_KEY")
    if not key:
        return unavailable("VirusTotal", "VIRUSTOTAL_API_KEY")
    url_id = base64.urlsafe_b64encode(url.encode()).decode().rstrip("=")
    r = await client.get(f"{VT_BASE}/urls/{url_id}", headers={"x-apikey": key})
    if r.status_code == 429:
        return vt_rate_limited()
    if r.status_code == 404:
        return Signal(source="VirusTotal", status="unknown", score=0, weight=0,
                      summary="VirusTotal has no record of this link yet")
    r.raise_for_status()
    return vt_stats_signal("VirusTotal", r.json()["data"]["attributes"]["last_analysis_stats"], "link")


async def domain_age(client: httpx.AsyncClient, host: str) -> Signal:
    source = "Domain age (RDAP)"
    if not host or _is_ip(host):
        return Signal(source=source, status="unknown", score=0, weight=0, summary="No domain name to look up")
    domain = registrable_domain(host)
    r = await client.get(RDAP_URL + domain)
    if r.status_code == 404:
        return Signal(source=source, status="unknown", score=0, weight=0,
                      summary="No public registration record found", evidence={"domain": domain})
    r.raise_for_status()
    events = r.json().get("events") or []
    registered = next((e.get("eventDate") for e in events if e.get("eventAction") == "registration"), None)
    if not registered:
        return Signal(source=source, status="unknown", score=0, weight=0,
                      summary="Registration date isn't published", evidence={"domain": domain})
    created = datetime.fromisoformat(registered.replace("Z", "+00:00"))
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    days = max(0, (datetime.now(timezone.utc) - created).days)
    evidence = {"domain": domain, "registered": created.date().isoformat(), "age_days": days}
    if days < 30:
        return Signal(source=source, status="suspicious", score=65, weight=1.0,
                      summary=f"Domain registered only {days} day{'s' if days != 1 else ''} ago",
                      evidence={**evidence, "threat_type": "Newly registered domain"})
    if days < 180:
        return Signal(source=source, status="suspicious", score=35, weight=1.0,
                      summary=f"Domain is only {days} days old",
                      evidence={**evidence, "threat_type": "Newly registered domain"})
    years = days // 365
    return Signal(source=source, status="clean", score=0, weight=0.8,
                  summary=f"Domain has existed for {years} year{'s' if years != 1 else ''}" if years
                  else f"Domain is {days} days old",
                  evidence=evidence)


LINK_MODEL = "ARGUS ML (link)"


def link_model_signal(host: str) -> Signal | None:
    """Argus's phishing-name model, as a careful second opinion. Sites with a reputation are skipped (it speaks
    for them), and so are pages on shared platforms, whose address is mostly the platform's name."""
    if not host or _is_ip(host) or platform_of(host) or site_rank(host) is not None \
            or any(is_official(host, b) for b in BRAND_DOMAINS):
        return None
    domain = registrable_domain(host)
    p = phish_link.phishing_probability(domain)
    if p is None:
        return None
    evidence = {"domain": domain, "phishing_probability": round(p, 3), "threshold": phish_link.THRESHOLD}
    if p >= phish_link.THRESHOLD:
        return Signal(source=LINK_MODEL, status="suspicious", score=60, weight=0.8,
                      summary=f"Its name looks like a phishing site's ({p:.0%} likely)",
                      evidence={**evidence, "threat_type": "Phishing"})
    return Signal(source=LINK_MODEL, status="clean", score=0, weight=0.3,
                  summary="Its name isn't a clear match for known phishing domains", evidence=evidence)


# --- putting it together -----------------------------------------------------------------------------
def address_signals(url: str, host: str, after_redirect: bool = False) -> list[Signal]:
    signals = [heuristics(url), typosquat_signal(host), popularity_signal(host), local_intel(host)]
    model = link_model_signal(host)
    if model:
        signals.append(model)
    if after_redirect:
        return [_after(s) for s in signals] + feed_signals(url, host, prefix=AFTER)
    return signals + feed_signals(url, host)


# When Argus checks mail on its own, opening a link can use it up (unsubscribe, "verify your email", password
# resets, magic sign-in links) or tell a spammer the address is live. So those links are judged without a visit.
ONE_TIME = re.compile(r"(unsub|opt-?out|verif|confirm|activat|reset|passw|magic|one-?time|otp|token=|code=|sign-?in|"
                      r"log-?in|logon|auth|invite|accept|approve|cancel|revoke|session|key=)", re.I)


def visit_decision(url: str, mailbox: str | None) -> str | None:
    """Why a link found in a mailbox won't be opened, or None when it will be. Links you check yourself always are."""
    if mailbox is None:
        return None
    if mailbox == "spam":
        return "Not opened: links in spam are never visited, so the sender can't learn your address is live"
    parsed = urlparse(normalize_url(url))
    if ONE_TIME.search(f"{parsed.path}?{parsed.query}"):
        return "Not opened: it looks like a one-time link (unsubscribe, sign-in, verify or reset) that opening could use up"
    host = host_of(url)
    if is_shortener(host):
        return "Not opened: short links are only followed when you check a link yourself"
    if is_popular(host):
        return "Not opened: a well-known site, so its reputation is enough"
    return None


def quick_check_url(raw: str) -> Verdict:
    """Instant verdict from the address, the live feeds and site reputation, without visiting the site.
    Used by the browser extension to warn while a page is still starting to load."""
    url = normalize_url(raw)
    return combine("url", url, address_signals(url, host_of(url)))


async def check_url(raw: str, skip_visit: str | None = None) -> Verdict:
    """The full check. `skip_visit` (a reason) judges the link without opening it; see visit_decision."""
    url = normalize_url(raw)
    host = host_of(url)
    async with make_client() as client:
        live, remote = await asyncio.gather(
            asyncio.wait_for(live_check(client, url, host, visit=skip_visit is None), LIVE_CHECK_SECONDS),
            asyncio.gather(
                guarded("URLhaus", urlhaus(client, url)),
                guarded("Google Safe Browsing", safe_browsing(client, url)),
                guarded("VirusTotal", virustotal_url(client, url)),
                guarded("Domain age (RDAP)", domain_age(client, host)),
            ),
            return_exceptions=True,
        )
    if not isinstance(live, Live):
        live = Live()
    landed = host_of(live.page.final_url) if live.page else host

    signals = address_signals(url, host)
    signals.append(dns_signal(live.ips))
    signals.append(tls_signal(url, live.cert, live.page))
    signals += page_signals(live.page, popular=is_popular(landed))
    redirect = redirect_signal(url, live.page)
    if redirect and live.page:
        # A link's own popularity can't vouch for a different site it forwards to: trust comes from where it lands.
        signals = [s.model_copy(update={"trust": 0.0}) if s.trust else s for s in signals]
        signals.append(redirect)
        signals += address_signals(live.page.final_url, landed, after_redirect=True)
    if skip_visit:
        signals.append(Signal(source="Page visit", status="unknown", score=0, weight=0, summary=skip_visit))
    if isinstance(remote, list):
        signals += remote
    return combine("url", url, signals)
