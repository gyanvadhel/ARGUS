import io
import zipfile

from argus_api.intel.feeds import FeedStore, normalize_feed_url, parse_domain_list, parse_tranco_zip, parse_url_list

URLHAUS = "# URLhaus\nhttp://115.53.209.112:45592/i\nhttps://bad.example.com/payload.exe\n"
OPENPHISH = "https://login-paypa1.com/signin/\nhttp://yard749.pages.dev/\n"
PHISHDB = "# comment\nsecure-paypal-verify.com\nfoo.000webhostapp.com\n"


def tranco_zip(rows):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("top-1m.csv", "\n".join(f"{i},{d}" for i, d in enumerate(rows, start=1)))
    return buf.getvalue()


def fake_fetch(calls):
    data = {
        "https://urlhaus.abuse.ch/downloads/text_online/": URLHAUS.encode(),
        "https://openphish.com/feed.txt": OPENPHISH.encode(),
        "https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt": PHISHDB.encode(),
        "https://tranco-list.eu/top-1m.csv.zip": tranco_zip(["google.com", "paypal.com", "amazon.com"]),
    }

    def fetch(url):
        calls.append(url)
        return data[url]

    return fetch


def test_normalize_matches_http_and_https_and_trailing_slash():
    assert normalize_feed_url("https://Login-PayPa1.com/signin/") == normalize_feed_url("http://login-paypa1.com/signin")
    assert normalize_feed_url("http://1.2.3.4:8080/x") == "1.2.3.4:8080/x"


def test_parse_url_list_keeps_urls_and_hosts():
    urls, hosts = parse_url_list(URLHAUS)
    assert "115.53.209.112:45592/i" in urls
    assert "bad.example.com" in hosts
    assert len(urls) == 2


def test_parse_domain_list_skips_comments():
    assert parse_domain_list(PHISHDB) == {"secure-paypal-verify.com", "foo.000webhostapp.com"}


def test_parse_tranco_zip_ranks_domains():
    ranks = parse_tranco_zip(tranco_zip(["google.com", "paypal.com"]))
    assert ranks == {"google.com": 1, "paypal.com": 2}


def test_store_downloads_caches_and_answers(tmp_path):
    calls = []
    store = FeedStore(cache_dir=tmp_path, fetch=fake_fetch(calls))
    store.refresh()
    assert len(calls) == 4
    assert store.url_hit("openphish", "http://login-paypa1.com/signin") == "url"
    assert store.url_hit("urlhaus", "https://bad.example.com/other") == "host"
    assert store.url_hit("urlhaus", "https://good.example.org/") is None
    assert store.domain_listed("foo.000webhostapp.com", None)
    assert not store.domain_listed("bar.000webhostapp.com", None)
    assert store.domain_listed("www.secure-paypal-verify.com", "secure-paypal-verify.com")
    assert store.rank("paypal.com") == 2
    assert store.status()["openphish"]["count"] == 2


def test_store_does_not_refetch_fresh_feeds_and_reloads_from_disk(tmp_path):
    calls = []
    FeedStore(cache_dir=tmp_path, fetch=fake_fetch(calls)).refresh()
    again = FeedStore(cache_dir=tmp_path, fetch=fake_fetch(calls))
    again.load_from_cache()
    again.refresh()
    assert len(calls) == 4  # nothing downloaded twice while fresh
    assert again.rank("google.com") == 1


def test_a_failed_download_keeps_the_feed_unloaded_and_records_why(tmp_path):
    def broken(url):
        raise OSError("offline")

    store = FeedStore(cache_dir=tmp_path, fetch=broken)
    store.refresh()
    assert not store.loaded("openphish")
    assert "offline" in store.status()["openphish"]["error"]
