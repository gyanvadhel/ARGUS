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
    # Positive evidence that something is legitimate (0..1), e.g. one of the world's most visited sites.
    trust: float = Field(default=0.0, ge=0.0, le=1.0)
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
    # True only when something positive confirms it (not merely "nothing found").
    verified: bool = False
