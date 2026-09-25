from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from argus_api import config

app = FastAPI(title="ARGUS API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "sources": config.source_status()}
