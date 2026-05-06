# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RAG (Retrieval-Augmented Generation) knowledge base Q&A system — a portfolio project.

- **Backend:** FastAPI + LangChain + ChromaDB + OpenAI
- **Frontend:** Vite + React + Tailwind CSS
- **Models:** `gpt-4o-mini` (LLM), `text-embedding-3-small` (embeddings)

## Commands

Backend（from `backend/`）:
```bash
cp .env.example .env          # fill in OPENAI_API_KEY
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend（from `frontend/`）:
```bash
npm install
npm run dev                   # http://localhost:5173
```

## Testing

Run from `backend/`:
```bash
pip install pytest   # not in requirements.txt — install once
python -m pytest tests/ -v
```

`tests/conftest.py` sets dummy `OPENAI_API_KEY` and `JWT_SECRET_KEY` so app modules can be imported without a real `.env`. Any new test file that imports `app.*` relies on this.

## Backend Architecture

Configuration is centralized in `app/config.py` via `pydantic-settings`. All settings are read from `.env` and accessed via the singleton `settings` object — import it directly, never instantiate `Settings` again.

```
app/
├── main.py           # FastAPI app, CORS middleware, router registration
├── config.py         # Single settings singleton (pydantic-settings)
├── routers/
│   ├── documents.py  # GET /api/documents, POST /api/documents/upload, DELETE /api/documents/{filename}
│   └── query.py      # POST /api/query — retrieve + LLM answer
└── services/
    ├── vector_store.py   # ChromaDB client: add / search / list_sources / delete_source
    ├── embeddings.py     # OpenAI embedding wrapper (lazy singleton)
    └── llm.py            # LangChain RAG chain (lazy singleton)
```

All three service singletons (`OpenAIEmbeddings`, `Chroma`, `ChatOpenAI`) use module-level `_var: Type | None = None` lazy init — instantiated on first request, reused thereafter. This lets the server start and serve `/health` even without a valid `.env`.

`CORS_ORIGINS` in `.env` is a comma-separated string; `settings.cors_origins_list` splits it into a list for the middleware.

### ChromaDB metadata schema

Each chunk stored in ChromaDB has the following metadata:
```
{
  "source": "filename.pdf",   # original filename
  "folder": "資料夾名稱",      # user-defined folder for filtering
  "user_id": "uuid-string"    # owner's user ID — used in all where-filter queries
}
```

Document ingestion flow: upload → parse (pypdf / python-docx) → chunk (`RecursiveCharacterTextSplitter`, size=`CHUNK_SIZE`, overlap=`CHUNK_OVERLAP`) → embed → upsert into ChromaDB with metadata.

Query flow: embed question → `similarity_search_comprehensive` (two-stage hybrid: Stage 1 picks top `RETRIEVAL_TOP_FILES` files via BM25 + vector RRF; Stage 2 does deep per-file hybrid retrieval) → join up to `_MAX_TOTAL_CHUNKS=40` chunks as context → `SystemMessage + history + HumanMessage | ChatOpenAI | StrOutputParser` → return answer + deduplicated sources.

**Known warning:** pydantic-settings v2 emits `PydanticDeprecatedSince20` on every import because `config.py` uses `Field(env=...)` syntax. Harmless — do not refactor unless specifically tasked.

ChromaDB persists to disk at `chroma_db/` (gitignored). If you change `CHUNK_SIZE`/`CHUNK_OVERLAP`, delete `chroma_db/` and re-upload all documents.

### Folder filtering (planned)

Folders are not stored separately — they are derived from the `folder` metadata field on each chunk. When a query includes a `folders` list, pass `where={"folder": {"$in": folders}}` to ChromaDB's `similarity_search`. If no folders are specified, search the entire collection.

## Frontend Architecture

Single-page app. All API calls point to `http://localhost:8000` (hardcoded in `App.jsx` and `BookshelfPanel.jsx` as `const API`).

```
src/
├── App.jsx                  # root: chat state, handleSend, layout
└── components/
    ├── ChatWindow.jsx        # message list, auto-scroll, source badges
    ├── ChatInput.jsx         # textarea, Enter to send, shift+Enter for newline
    └── BookshelfPanel.jsx    # slide-in drawer: upload (click + drag), file list, delete
```

`chat_history` is derived from the `messages` state in `App.jsx` and sent with every query request so the LLM has conversation context.

### Design system (src/index.css)

**Aesthetic:** Editorial Warm — parchment/cream + burnt copper accent, Fraunces serif display + DM Sans body + DM Mono labels. Subtle paper-grain noise overlay on `body::before`. All components use CSS variables, NOT hardcoded zinc/slate.

**Core tokens** (defined on `:root` and `.dark`):
- Surfaces: `--bg`, `--surface`, `--surface-alt`, `--surface-hover`, `--sidebar`, `--header`
- Borders: `--border`, `--border-strong`, `--accent-border`
- Text: `--text-1/2/3`
- Accent (burnt copper): `--accent`, `--accent-2`, `--accent-hover`, `--accent-fg`, `--accent-subtle`
- User bubble: `--user-bubble-from/to`, `--user-text`
- Status: `--danger`, `--danger-bg`, `--success`, `--success-bg`
- Shadows: `--shadow-soft`, `--shadow-pop`

**Utility classes** (use these instead of writing token references inline):
- Surfaces: `.bg-bg`, `.bg-surface`, `.bg-surface-alt`, `.bg-sidebar`, `.bg-header`, `.bg-accent-subtle`
- Text: `.text-1`, `.text-2`, `.text-3`, `.text-accent`, `.text-danger`
- Borders: `.border-1`, `.border-2-strong`, `.border-accent`
- Components: `.card`, `.card-soft`, `.dialog-overlay`, `.dialog-panel`, `.dialog-panel-accent`
- Buttons: `.btn` + variants `.btn-primary` / `.btn-ghost` / `.btn-soft` / `.btn-danger`; `.btn-icon` (+ `.btn-icon-danger`)
- Inputs: `.input-field`, `.chat-textarea`
- Tabs (segmented control): `.tab-bar` + `.tab-button` + `.tab-button-active`
- Pills: `.pill`, `.pill-accent`, `.pill-success`, `.pill-danger`
- Brand: `.brand-mark` (gradient copper monogram)
- Editorial: `.label-mono` (small mono uppercase label), `.editorial-rule` (thin double divider)

**Fonts:** `DM Sans` (body, default), `DM Mono` (`.font-mono` / `.label-mono`), `Fraunces` (`.font-display` — for `知識庫`, dialog titles, folder names, all editorial headings).

**Animations:** `.msg-in` / `.fade-up[-2/3/4]` (entrance), `.cursor-blink` (streaming cursor), `.chat-ambient` (radial copper glow), `.no-transitions` (toggle during theme switch).

**Dark mode:** `document.documentElement.classList.toggle("dark", ...)` in `App.jsx` — CSS vars switch automatically. The body grain texture also switches between multiply (light) and screen (dark) blend modes.
