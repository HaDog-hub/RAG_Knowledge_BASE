import os
import stat
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import auth, conversations, documents, folders, query, search


def _restrict_db_permissions() -> None:
    # Owner read/write only (600) — no-op on Windows
    targets = [
        "users.db",
        settings.chroma_persist_dir,
    ]
    for path in targets:
        if os.path.exists(path):
            try:
                os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
            except NotImplementedError:
                pass  # Windows — handled at OS/deployment level


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _restrict_db_permissions()
    yield


app = FastAPI(
    title="RAG Knowledge Base API",
    description="A retrieval-augmented generation API for knowledge base Q&A",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(folders.router)
app.include_router(query.router)
app.include_router(search.router)
app.include_router(conversations.router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.3.0"}


# ── Static files (production only) ─────────────────────────────────────────
from fastapi.staticfiles import StaticFiles

_dist = os.path.join(os.path.dirname(__file__), "..", "dist")
if os.path.isdir(_dist):
    app.mount("/", StaticFiles(directory=_dist, html=True), name="static")
