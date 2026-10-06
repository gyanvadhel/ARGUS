"""Build the scam-site blocklist from loaded threat feeds.

The list is plain text, one hostname per line, sorted.  It powers the
Android scam-site blocker, which resolves DNS queries on the phone.

Filtering rules (from the spec):
- Only hostnames, never IP addresses.
- Remove shared hosts (link shorteners, platform roots like pages.dev,
  github.io) and anything in the Tranco top-100k.
- Platform subdomains (evil.pages.dev) stay as exact entries.
"""
from __future__ import annotations

import ipaddress
import logging
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from argus_api.intel.feeds import FeedStore

log = logging.getLogger("argus.blocklist")

# Shared platform roots that should never be blocked wholesale.
# Subdomains on these (evil.pages.dev) are kept as exact entries.
SHARED_HOSTS: frozenset[str] = frozenset({
    # Link shorteners
    "bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "is.gd",
    "buff.ly", "rb.gy", "cutt.ly", "shorturl.at", "t.ly",
    # Hosting / platform roots
    "pages.dev", "github.io", "github.com", "gitlab.com", "gitlab.io",
    "vercel.app", "netlify.app", "netlify.com", "herokuapp.com",
    "firebaseapp.com", "web.app", "appspot.com",
    "blogspot.com", "wordpress.com", "sites.google.com",
    "docs.google.com", "forms.gle", "drive.google.com",
    "dropbox.com", "onedrive.live.com",
    "amazonaws.com", "s3.amazonaws.com", "cloudfront.net",
    "azurewebsites.net", "blob.core.windows.net",
    # Social / messaging
    "discord.com", "discord.gg", "t.me", "wa.me",
    "facebook.com", "instagram.com", "twitter.com", "x.com",
    "youtube.com", "youtu.be", "linkedin.com", "reddit.com",
    # Other
    "ipfs.io", "weebly.com", "wixsite.com", "squarespace.com",
})

TRANCO_CUTOFF = 100_000

# What a DNS lookup can actually ask for: dot-separated labels of letters, digits, hyphens (and the underscores some
# real hosts use). Anything else in a feed is junk the phone would never see.
_HOSTNAME = re.compile(r"^(?=.{1,253}$)[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?)+$")


def _is_ip(name: str) -> bool:
    """True if *name* is an IPv4 or IPv6 literal (not a hostname), possibly with a port."""
    # Strip port suffix (1.2.3.4:8080 → 1.2.3.4)
    host = name.strip("[]").rsplit(":", 1)[0] if "." in name else name.strip("[]")
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def _parent_domains(name: str) -> list[str]:
    """Return parent domains from most-specific to least: a.b.c → [b.c, c]."""
    parts = name.split(".")
    return [".".join(parts[i:]) for i in range(1, len(parts) - 1)]


def build_blocklist(store: FeedStore) -> list[str]:
    """Return a sorted, deduplicated list of hostnames to block.

    Sources:
    - Phishing.Database domains  (store._domains)
    - OpenPhish hosts            (store._hosts["openphish"])
    - URLhaus hosts              (store._hosts["urlhaus"])
    """
    raw: set[str] = set()

    # 1. Phishing.Database domains
    raw.update(store._domains)

    # 2. OpenPhish hosts
    raw.update(store._hosts.get("openphish", set()))

    # 3. URLhaus hosts
    raw.update(store._hosts.get("urlhaus", set()))

    # --- Filter ---
    blocked: list[str] = []
    for name in raw:
        name = name.lower().strip().rstrip(".")
        if not name or _is_ip(name):
            continue
        # "host:8080" is looked up as "host"; a port never reaches DNS.
        if ":" in name and name.count(":") == 1 and name.rsplit(":", 1)[1].isdigit():
            name = name.rsplit(":", 1)[0]
        if not _HOSTNAME.match(name):
            continue

        # Is this name itself a shared host?  Drop it (the bare root).
        if name in SHARED_HOSTS:
            continue

        # Is this a subdomain of a shared host?  Keep it as an exact entry
        # (the spec says "evil.pages.dev stays"), but still check Tranco below.
        # (No special action needed — just don't drop it.)

        # Drop anything in Tranco top-100k.
        rank = store.rank(name)
        if rank is not None and rank <= TRANCO_CUTOFF:
            continue

        # Also check if any parent domain is in the Tranco top-100k.
        # But only if the name itself isn't a subdomain of a shared host
        # (we want to keep evil.pages.dev even though pages.dev might rank).
        parents = _parent_domains(name)
        is_on_shared_platform = any(p in SHARED_HOSTS for p in parents)
        if not is_on_shared_platform:
            parent_ranked = any(
                (store.rank(p) or TRANCO_CUTOFF + 1) <= TRANCO_CUTOFF
                for p in parents
            )
            if parent_ranked:
                continue

        blocked.append(name)

    blocked.sort()
    log.info("blocklist: %d names from %d raw", len(blocked), len(raw))
    return blocked
