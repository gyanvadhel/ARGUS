"""Brands scammers impersonate: their real domains, display names, and how they're written on a page."""
from __future__ import annotations

import re

BRAND_DOMAINS: dict[str, tuple[str, ...]] = {
    "paypal": ("paypal.com", "paypal.me"),
    "amazon": ("amazon.com", "amazon.in", "amazon.co.uk", "amazon.de", "amazon.ca", "amazon.com.au"),
    "microsoft": ("microsoft.com", "live.com", "office.com", "microsoftonline.com", "outlook.com", "office365.com", "sharepoint.com"),
    "apple": ("apple.com", "icloud.com"),
    "google": ("google.com", "gmail.com", "youtube.com", "google.co.in"),
    "netflix": ("netflix.com",),
    "facebook": ("facebook.com", "fb.com", "meta.com"),
    "instagram": ("instagram.com",),
    "whatsapp": ("whatsapp.com", "whatsapp.net"),
    "chase": ("chase.com",),
    "wellsfargo": ("wellsfargo.com",),
    "bankofamerica": ("bankofamerica.com", "bofa.com"),
    # Indian banks are moving to the RBI-only .bank.in domain.
    "hdfc": ("hdfcbank.com", "hdfc.bank.in"),
    "icici": ("icicibank.com", "icici.bank.in"),
    "sbi": ("onlinesbi.sbi", "sbi.co.in", "sbi.bank.in"),
    "paytm": ("paytm.com",),
    "dhl": ("dhl.com",),
    "fedex": ("fedex.com",),
    "usps": ("usps.com",),
    "coinbase": ("coinbase.com",),
    "binance": ("binance.com",),
    "metamask": ("metamask.io",),
    "docusign": ("docusign.com", "docusign.net"),
    "dropbox": ("dropbox.com",),
    "adobe": ("adobe.com",),
    "linkedin": ("linkedin.com",),
    "steam": ("steampowered.com", "steamcommunity.com"),
}

BRAND_NAMES = {
    "paypal": "PayPal", "wellsfargo": "Wells Fargo", "bankofamerica": "Bank of America", "hdfc": "HDFC", "icici": "ICICI",
    "sbi": "SBI", "whatsapp": "WhatsApp", "dhl": "DHL", "fedex": "FedEx", "usps": "USPS", "metamask": "MetaMask",
    "docusign": "DocuSign", "linkedin": "LinkedIn",
}

# How each brand shows up in page titles and text.
BRAND_PATTERNS: dict[str, re.Pattern[str]] = {
    "paypal": re.compile(r"\bpay\s?pal\b", re.I),
    "amazon": re.compile(r"\bamazon\b", re.I),
    "microsoft": re.compile(r"\b(microsoft|office\s?365|outlook|onedrive|sharepoint)\b", re.I),
    "apple": re.compile(r"\b(apple\s?id|icloud|apple\s?pay)\b", re.I),
    "google": re.compile(r"\b(google|gmail)\b", re.I),
    "netflix": re.compile(r"\bnetflix\b", re.I),
    "facebook": re.compile(r"\bfacebook\b", re.I),
    "instagram": re.compile(r"\binstagram\b", re.I),
    "whatsapp": re.compile(r"\bwhats\s?app\b", re.I),
    "chase": re.compile(r"\bchase\s+(bank|online)\b", re.I),
    "wellsfargo": re.compile(r"\bwells\s?fargo\b", re.I),
    "bankofamerica": re.compile(r"\bbank\s+of\s+america\b", re.I),
    "hdfc": re.compile(r"\bhdfc\b", re.I),
    "icici": re.compile(r"\bicici\b", re.I),
    "sbi": re.compile(r"\b(sbi|state\s+bank\s+of\s+india)\b", re.I),
    "paytm": re.compile(r"\bpaytm\b", re.I),
    "dhl": re.compile(r"\bdhl\b", re.I),
    "fedex": re.compile(r"\bfedex\b", re.I),
    "usps": re.compile(r"\busps\b", re.I),
    "coinbase": re.compile(r"\bcoinbase\b", re.I),
    "binance": re.compile(r"\bbinance\b", re.I),
    "metamask": re.compile(r"\bmetamask\b", re.I),
    "docusign": re.compile(r"\bdocu\s?sign\b", re.I),
    "dropbox": re.compile(r"\bdropbox\b", re.I),
    "adobe": re.compile(r"\badobe\b", re.I),
    "linkedin": re.compile(r"\blinkedin\b", re.I),
    "steam": re.compile(r"\bsteam\s+(community|guard|wallet)\b", re.I),
}


def brand_name(brand: str) -> str:
    return BRAND_NAMES.get(brand, brand.title())


def is_official(host: str, brand: str) -> bool:
    return any(host == d or host.endswith("." + d) for d in BRAND_DOMAINS.get(brand, ()))
