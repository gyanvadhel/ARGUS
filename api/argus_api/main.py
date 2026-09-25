from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from argus_api import config
from argus_api.checkers.text import check_text
from argus_api.checkers.url import check_url
from argus_api.detect import detect_kind
from argus_api.models import Kind, Verdict

app = FastAPI(title="ARGUS API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScanRequest(BaseModel):
    input: str = Field(max_length=100_000)
    kind: Kind | None = None
    community_reports: int = Field(default=0, ge=0, le=100_000)

    @field_validator("input")
    @classmethod
    def not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("input is empty")
        return value


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "sources": config.source_status()}


async def dispatch(kind: Kind, text: str, community_reports: int) -> Verdict:
    if kind == "url":
        return await check_url(text)
    return await check_text(text)


@app.post("/scan", response_model=Verdict)
async def scan(req: ScanRequest) -> Verdict:
    kind = req.kind or detect_kind(req.input)
    return await dispatch(kind, req.input, req.community_reports)
