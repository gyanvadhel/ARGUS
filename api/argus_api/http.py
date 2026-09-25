import asyncio
from typing import Awaitable

import httpx

from argus_api.models import Signal

TIMEOUT = httpx.Timeout(6.0)


def make_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers={"User-Agent": "ARGUS-Scanner/1.0"})


async def guarded(source: str, pending: Awaitable[Signal], timeout: float = 8.0) -> Signal:
    """Never let one flaky source break a scan."""
    try:
        return await asyncio.wait_for(pending, timeout)
    except Exception as exc:  # noqa: BLE001 - any failure becomes an "error" signal
        return Signal(source=source, status="error", score=0, weight=0,
                      summary=f"{source} couldn't be reached ({type(exc).__name__})")


def unavailable(source: str, key_name: str) -> Signal:
    return Signal(source=source, status="unavailable", score=0, weight=0,
                  summary=f"{source} is not configured (set {key_name})")
