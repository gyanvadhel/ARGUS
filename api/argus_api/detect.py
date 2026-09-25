import re

from argus_api.models import Kind

_HEADER = re.compile(r"^(from|to|subject|received|return-path|message-id|date|reply-to|authentication-results):", re.I | re.M)
_URL = re.compile(r"^(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(:\d{2,5})?([/?#]\S*)?$", re.I)
_IP_URL = re.compile(r"^(https?://)?\d{1,3}(\.\d{1,3}){3}(:\d{2,5})?([/?#]\S*)?$")
_SCHEME = re.compile(r"^https?://\S+$", re.I)
_PHONE = re.compile(r"^\+?[\d\s\-().]{7,20}$")


def detect_kind(raw: str) -> Kind:
    text = raw.strip()
    if len(_HEADER.findall(text)) >= 2:
        return "email"
    if _PHONE.match(text) and 7 <= sum(ch.isdigit() for ch in text) <= 15:
        return "phone"
    if _SCHEME.match(text) or _IP_URL.match(text) or _URL.match(text):
        return "url"
    return "text"
