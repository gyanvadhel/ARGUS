import httpx
import pytest
import respx

from argus_api.intel import netcheck

HOSTS = {
    "short.ly": ["93.184.216.34"],
    "landing.example": ["93.184.216.35"],
    "intranet.example": ["192.168.1.20"],
    "gone.example": [],
}


@pytest.fixture
def online(monkeypatch):
    monkeypatch.delenv("ARGUS_OFFLINE", raising=False)

    async def fake_resolve(host):
        return HOSTS.get(host, ["93.184.216.36"])

    monkeypatch.setattr(netcheck, "resolve", fake_resolve)


async def test_follows_redirects_to_the_final_page(online):
    with respx.mock:
        respx.get("https://short.ly/abc").respond(301, headers={"location": "https://landing.example/login"})
        respx.get("https://landing.example/login").respond(200, html="<title>Login</title>")
        async with httpx.AsyncClient() as c:
            page = await netcheck.fetch_page(c, "https://short.ly/abc")
    assert page.final_url == "https://landing.example/login"
    assert [h.status for h in page.chain] == [301, 200]
    assert "Login" in page.html


async def test_refuses_to_follow_into_a_private_network(online):
    with respx.mock:
        respx.get("https://short.ly/x").respond(302, headers={"location": "http://intranet.example/admin"})
        async with httpx.AsyncClient() as c:
            page = await netcheck.fetch_page(c, "https://short.ly/x")
    assert page.blocked and "private" in page.blocked
    assert page.html is None


async def test_reports_domains_that_do_not_exist(online):
    async with httpx.AsyncClient() as c:
        page = await netcheck.fetch_page(c, "https://gone.example/")
    assert page.error == "nxdomain"


async def test_spots_links_that_download_an_app(online):
    headers = {"content-type": "application/vnd.android.package-archive", "content-disposition": 'attachment; filename="bank-update.apk"'}
    with respx.mock:
        respx.get("https://landing.example/app").respond(200, content=b"PK..", headers=headers)
        async with httpx.AsyncClient() as c:
            page = await netcheck.fetch_page(c, "https://landing.example/app")
    assert page.download == "bank-update.apk"
    assert page.html is None


async def test_inline_web_page_with_a_filename_is_still_read_as_a_page(online):
    # Vercel serves ordinary pages with "Content-Disposition: inline; filename=..."
    headers = {"content-type": "text/html; charset=utf-8", "content-disposition": 'inline; filename="eoirw4jvcx"'}
    with respx.mock:
        respx.get("https://landing.example/p").respond(200, content=b"<title>Sign in</title>", headers=headers)
        async with httpx.AsyncClient() as c:
            page = await netcheck.fetch_page(c, "https://landing.example/p")
    assert page.download is None
    assert "Sign in" in page.html


async def test_offline_mode_never_touches_the_network():
    assert await netcheck.resolve("example.com") is None
    assert await netcheck.certificate("example.com") is None
