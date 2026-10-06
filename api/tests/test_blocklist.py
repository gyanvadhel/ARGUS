"""Tests for the scam-site blocklist builder."""
import io
import zipfile

from argus_api.blocklist import SHARED_HOSTS, build_blocklist
from argus_api.intel.feeds import FeedStore


def tranco_zip(rows):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("top-1m.csv", "\n".join(f"{i},{d}" for i, d in enumerate(rows, start=1)))
    return buf.getvalue()


URLHAUS = "# header\nhttp://evil-malware.com/payload\nhttps://192.168.1.1:8080/bad\n"
OPENPHISH = "https://phish.example.net/login\nhttps://evil.pages.dev/steal\n"
PHISHDB = "phishing-domain.org\nexample-phish.com\ngoogle.com\nbit.ly\n"


def _store(tmp_path, tranco_names=None):
    """Build a FeedStore with the test data loaded."""
    if tranco_names is None:
        tranco_names = ["google.com", "facebook.com", "amazon.com"]

    data = {
        "https://urlhaus.abuse.ch/downloads/text_online/": URLHAUS.encode(),
        "https://openphish.com/feed.txt": OPENPHISH.encode(),
        "https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt": PHISHDB.encode(),
        "https://tranco-list.eu/top-1m.csv.zip": tranco_zip(tranco_names),
    }
    store = FeedStore(cache_dir=tmp_path, fetch=lambda url: data[url])
    store.refresh()
    return store


def test_basic_blocklist_includes_phishing_domains(tmp_path):
    store = _store(tmp_path)
    names = build_blocklist(store)
    assert "phishing-domain.org" in names
    assert "example-phish.com" in names


def test_ip_addresses_are_excluded(tmp_path):
    store = _store(tmp_path)
    names = build_blocklist(store)
    # 192.168.1.1 from URLhaus should be stripped
    assert not any("192.168" in n for n in names)


def test_shared_hosts_are_excluded(tmp_path):
    store = _store(tmp_path)
    names = build_blocklist(store)
    # bit.ly appears in PHISHDB but should be filtered as a shared host
    assert "bit.ly" not in names
    for host in SHARED_HOSTS:
        assert host not in names


def test_platform_subdomains_are_kept(tmp_path):
    store = _store(tmp_path)
    names = build_blocklist(store)
    # evil.pages.dev is a subdomain of the shared host pages.dev — keep it
    assert "evil.pages.dev" in names


def test_tranco_top_100k_are_excluded(tmp_path):
    store = _store(tmp_path)
    names = build_blocklist(store)
    # google.com is in both PHISHDB and Tranco (rank 1) — should be filtered
    assert "google.com" not in names


def test_urlhaus_hosts_included(tmp_path):
    store = _store(tmp_path)
    names = build_blocklist(store)
    assert "evil-malware.com" in names


def test_openphish_hosts_included(tmp_path):
    store = _store(tmp_path)
    names = build_blocklist(store)
    assert "phish.example.net" in names


def test_blocklist_is_sorted(tmp_path):
    store = _store(tmp_path)
    names = build_blocklist(store)
    assert names == sorted(names)


def test_parent_domain_in_tranco_excludes_child(tmp_path):
    """If example.com is in Tranco top-100k, sub.example.com should be excluded
    (unless example.com is a shared platform)."""
    phishdb = "evil.amazon.com\nreal-phish.org\n"
    data = {
        "https://urlhaus.abuse.ch/downloads/text_online/": b"",
        "https://openphish.com/feed.txt": b"",
        "https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt": phishdb.encode(),
        "https://tranco-list.eu/top-1m.csv.zip": tranco_zip(["google.com", "amazon.com"]),
    }
    store = FeedStore(cache_dir=tmp_path, fetch=lambda url: data[url])
    store.refresh()
    names = build_blocklist(store)
    assert "evil.amazon.com" not in names  # parent amazon.com is in Tranco
    assert "real-phish.org" in names


def test_subdomain_of_shared_host_not_dropped_by_parent_tranco(tmp_path):
    """evil.pages.dev should stay even though pages.dev might be in Tranco,
    because pages.dev is a shared platform root."""
    phishdb = "evil.pages.dev\n"
    data = {
        "https://urlhaus.abuse.ch/downloads/text_online/": b"",
        "https://openphish.com/feed.txt": b"",
        "https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt": phishdb.encode(),
        "https://tranco-list.eu/top-1m.csv.zip": tranco_zip(["pages.dev"]),
    }
    store = FeedStore(cache_dir=tmp_path, fetch=lambda url: data[url])
    store.refresh()
    names = build_blocklist(store)
    assert "evil.pages.dev" in names
