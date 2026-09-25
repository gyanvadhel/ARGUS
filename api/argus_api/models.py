from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Status = Literal["clean", "suspicious", "malicious", "unknown", "unavailable", "error"]
Kind = Literal["url", "file", "email", "phone", "text", "call"]


class Signal(BaseModel):
    """One source's opinion about the thing being scanned."""
    source: str
    status: Status
    score: int = Field(ge=0, le=100)
    weight: float = 1.0
    summary: str
    authoritative: bool = False
    evidence: dict[str, Any] = Field(default_factory=dict)


class Verdict(BaseModel):
    kind: Kind
    subject: str
    score: int
    level: str
    threat_type: str
    signals: list[Signal]
    recommendation: str
    scanned_at: str
