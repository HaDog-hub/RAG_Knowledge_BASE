# RAG Two-Stage Retrieval + Hybrid Search — Design Spec

**Date:** 2026-05-01  
**Status:** Approved  
**Scope:** `backend/app/services/vector_store.py`, `backend/app/config.py`, `backend/requirements.txt`

---

## Problem

`similarity_search_comprehensive` allocates `_MAX_TOTAL_CHUNKS // num_files` chunks per file. With 50+ files this collapses to 1 chunk per file — chosen by pure vector similarity — causing frequent "insufficient information" responses when the relevant content happens not to be the top-1 chunk.

Two root causes:
1. **Allocation:** Budget spread too thin across irrelevant files.
2. **Selection:** Pure vector search misses keyword-exact matches.

---

## Solution: Two-Stage Retrieval + Hybrid Search

Replace `similarity_search_comprehensive` with a two-stage pipeline. The public interface (`query.py`, routers) is unchanged.

### Stage 1 — File Selection (broad)

Identify the top `RETRIEVAL_TOP_FILES` (default: 8) most relevant files from the entire in-scope corpus.

1. Fetch all chunks in scope from ChromaDB (`store.get(..., include=["documents", "metadatas"])`).
2. Score each chunk with **BM25** (keyword relevance).
3. Score top-N chunks with **vector similarity** via `similarity_search_with_score(k=20)`.
4. Merge both ranked lists with **RRF** (Reciprocal Rank Fusion):
   ```
   rrf_score = 1/(60 + rank_bm25) + 1/(60 + rank_vector)
   ```
5. Aggregate per file: take each file's highest-scoring chunk score.
6. Select the top `RETRIEVAL_TOP_FILES` files by aggregated score.

**Edge case:** If total files ≤ `RETRIEVAL_TOP_FILES`, skip Stage 1 and select all files directly.

### Stage 2 — Deep Per-File Retrieval (fine)

For each selected file:
1. Fetch all its chunks.
2. Score with BM25 + cosine similarity (RRF merge).
3. Take top `_MAX_TOTAL_CHUNKS // RETRIEVAL_TOP_FILES` chunks (e.g., 40 ÷ 8 = 5).

Final output: up to 40 chunks, concentrated on the 8 most relevant files.

---

## Hybrid Search: BM25 Implementation

**Library:** `rank-bm25` (lightweight, no extra model downloads).

**Tokenization** (no new dependencies):
```python
import re

def _tokenize(text: str) -> list[str]:
    # Split CJK characters individually; split Latin words by whitespace
    tokens = re.findall(r'[一-鿿㐀-䶿]|[a-zA-Z0-9]+', text.lower())
    return tokens or [""]
```

**RRF constant:** `k=60` (standard default; resistant to outlier scores).

**BM25 fallback:** If all BM25 scores are 0 (query has no tokenizable terms), use vector ranking only.

---

## Token Budget

| Scenario | Context tokens | vs. current |
|---|---|---|
| Current (50 files) | ~10,000 | baseline |
| Two-Stage (8 files × 5 chunks) | ~10,000 | **0% change** |

Total chunks sent to LLM remains `_MAX_TOTAL_CHUNKS = 40`. Cost is identical.

---

## Configuration

Add to `config.py`:
```python
retrieval_top_files: int = Field(8, env="RETRIEVAL_TOP_FILES")
```

Tune guidance:
- 50 files → 8 (default)
- 100+ files → 10–12
- < 10 files → Stage 1 skipped automatically

---

## Files Changed

| File | Change |
|---|---|
| `backend/app/services/vector_store.py` | Add `_tokenize`, `_bm25_scores`, `_rrf_merge`, `_hybrid_search_files`; rewrite `similarity_search_comprehensive` |
| `backend/app/config.py` | Add `retrieval_top_files` field |
| `backend/requirements.txt` | Add `rank-bm25` |

**Not changed:** `query.py`, all routers, all models, ChromaDB schema, existing chunk data.

---

## Functions to Add/Replace

```
vector_store.py
├── _tokenize(text) -> list[str]               # CJK + Latin tokenizer
├── _bm25_rank(query, docs) -> dict[int, int]  # returns {chunk_idx: rank}
├── _rrf_merge(bm25_ranks, vector_ranks) -> list[int]  # sorted chunk indices
├── _select_top_files(...) -> list[tuple[str,str]]      # Stage 1
└── similarity_search_comprehensive(...)       # rewritten — Stage 1 + Stage 2
```

---

## Out of Scope

- Parent-Child chunking (future enhancement if context quality still insufficient)
- Multi-Query retrieval (can be layered on top later)
- Changes to `similarity_search` or `search_with_scores` (used by search endpoint)
- Frontend changes
