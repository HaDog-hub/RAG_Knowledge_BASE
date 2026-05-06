# RAG Two-Stage Retrieval + Hybrid Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `similarity_search_comprehensive` with a two-stage pipeline that first selects the most relevant files (via hybrid BM25 + vector search), then does deep per-file retrieval — keeping the same 40-chunk token budget but concentrating it on relevant files.

**Architecture:** Stage 1 fetches all in-scope chunks, scores them with BM25 and vector search, aggregates scores per file, and picks the top 8 files. Stage 2 does a per-file hybrid search for each selected file and takes the best `40 ÷ 8 = 5` chunks. The public interface of `similarity_search_comprehensive` is unchanged — callers (`query.py`) require no modification.

**Tech Stack:** Python 3.10, FastAPI, ChromaDB (`langchain-chroma`), `rank-bm25` (new), `pytest` (tests)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/requirements.txt` | Modify | Add `rank-bm25` |
| `backend/app/config.py` | Modify | Add `retrieval_top_files` setting |
| `backend/app/services/vector_store.py` | Modify | Add `_tokenize`, `_bm25_scores`, `_rrf_merge`, `_select_top_files`; rewrite `similarity_search_comprehensive` |
| `backend/tests/__init__.py` | Create | Make tests/ a package |
| `backend/tests/conftest.py` | Create | Set env vars before any app import |
| `backend/tests/test_vector_store_hybrid.py` | Create | Unit + integration tests for new functions |

---

## Task 1: Add dependency and config setting

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/config.py`

- [ ] **Step 1: Add `rank-bm25` to requirements.txt**

Open `backend/requirements.txt` and add after the `tiktoken` line:
```
rank-bm25==0.2.2
```

- [ ] **Step 2: Add `retrieval_top_files` to config.py**

In `backend/app/config.py`, add this field inside the `Settings` class after `chunk_overlap`:
```python
retrieval_top_files: int = Field(8, env="RETRIEVAL_TOP_FILES")
```

- [ ] **Step 3: Install the new dependency**

Run from `backend/`:
```bash
pip install rank-bm25==0.2.2
```

Expected output: `Successfully installed rank-bm25-0.2.2`

- [ ] **Step 4: Verify import works**

```bash
python -c "from rank_bm25 import BM25Okapi; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/app/config.py
git commit -m "feat: add rank-bm25 dependency and retrieval_top_files config"
```

---

## Task 2: Add pure helper functions with tests

**Files:**
- Modify: `backend/app/services/vector_store.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_vector_store_hybrid.py`

- [ ] **Step 1: Write the failing tests for `_tokenize`, `_bm25_scores`, `_rrf_merge`**

Create `backend/tests/__init__.py` (empty file):
```python
```

Create `backend/tests/conftest.py`:
```python
import os
os.environ.setdefault("OPENAI_API_KEY", "test-key-placeholder")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-placeholder")
```

Create `backend/tests/test_vector_store_hybrid.py`:
```python
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.vector_store import _tokenize, _bm25_scores, _rrf_merge


class TestTokenize:
    def test_latin_words(self):
        assert _tokenize("hello world") == ["hello", "world"]

    def test_cjk_chars_split_individually(self):
        assert _tokenize("你好世界") == ["你", "好", "世", "界"]

    def test_mixed_text(self):
        result = _tokenize("GPT模型 performance")
        assert "gpt" in result
        assert "模" in result
        assert "型" in result
        assert "performance" in result

    def test_empty_string_returns_sentinel(self):
        assert _tokenize("") == [""]

    def test_numbers_included(self):
        assert "123" in _tokenize("123 items")

    def test_lowercases_latin(self):
        result = _tokenize("Hello WORLD")
        assert "hello" in result
        assert "world" in result
        assert "Hello" not in result


class TestBm25Scores:
    def test_returns_one_score_per_text(self):
        texts = ["the cat sat", "dogs bark loudly", "cats and kittens"]
        scores = _bm25_scores("cat", texts)
        assert len(scores) == 3

    def test_relevant_text_scores_higher(self):
        texts = ["the cat sat on the mat", "the dog barked loudly", "nothing relevant here"]
        scores = _bm25_scores("cat", texts)
        assert scores[0] > scores[1]
        assert all(s >= 0 for s in scores)

    def test_empty_corpus_returns_empty(self):
        assert _bm25_scores("query", []) == []

    def test_zero_scores_when_no_match(self):
        texts = ["unrelated text", "another unrelated doc"]
        scores = _bm25_scores("zzznomatch", texts)
        assert all(s == 0.0 for s in scores)

    def test_cjk_query(self):
        texts = ["量子計算是未來科技", "貓咪很可愛", "量子糾纏現象"]
        scores = _bm25_scores("量子", texts)
        assert scores[0] > scores[1]
        assert scores[2] > scores[1]


class TestRrfMerge:
    def test_returns_all_indices(self):
        result = _rrf_merge([0, 1, 2], [2, 1, 0])
        assert sorted(result) == [0, 1, 2]

    def test_index_top_in_both_lists_ranks_first(self):
        # Index 0 is top in bm25, index 2 is top in vector
        # Index 1 is second in both — should win overall
        result = _rrf_merge([1, 0, 2], [1, 2, 0])
        assert result[0] == 1

    def test_consistent_ranking(self):
        # bm25: [0,1,2], vector: [2,0,1]
        # 0: 1/60 + 1/61, 1: 1/61 + 1/62, 2: 1/62 + 1/60
        # 0 wins
        result = _rrf_merge([0, 1, 2], [2, 0, 1])
        assert result[0] == 0

    def test_empty_lists(self):
        assert _rrf_merge([], []) == []

    def test_single_element(self):
        assert _rrf_merge([0], [0]) == [0]
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd backend && python -m pytest tests/test_vector_store_hybrid.py -v 2>&1 | head -30
```

Expected: `ImportError` or `NameError` (functions don't exist yet)

- [ ] **Step 3: Add `import re` and `from rank_bm25 import BM25Okapi` to vector_store.py**

At the top of `backend/app/services/vector_store.py`, add after the existing imports:
```python
import re
from rank_bm25 import BM25Okapi
```

- [ ] **Step 4: Add `_tokenize`, `_bm25_scores`, `_rrf_merge` to vector_store.py**

Add these three functions right after the imports, before `_store: Chroma | None = None`:
```python
def _tokenize(text: str) -> list[str]:
    tokens = re.findall(r'[一-鿿㐀-䶿]|[a-zA-Z0-9]+', text.lower())
    return tokens or [""]


def _bm25_scores(query: str, texts: list[str]) -> list[float]:
    if not texts:
        return []
    corpus = [_tokenize(t) for t in texts]
    bm25 = BM25Okapi(corpus)
    return list(bm25.get_scores(_tokenize(query)))


def _rrf_merge(bm25_order: list[int], vector_order: list[int], k: int = 60) -> list[int]:
    scores: dict[int, float] = {}
    for rank, idx in enumerate(bm25_order):
        scores[idx] = scores.get(idx, 0.0) + 1.0 / (k + rank)
    for rank, idx in enumerate(vector_order):
        scores[idx] = scores.get(idx, 0.0) + 1.0 / (k + rank)
    return sorted(scores, key=lambda i: scores[i], reverse=True)
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd backend && python -m pytest tests/test_vector_store_hybrid.py::TestTokenize tests/test_vector_store_hybrid.py::TestBm25Scores tests/test_vector_store_hybrid.py::TestRrfMerge -v
```

Expected: all green, 0 failures

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/vector_store.py backend/tests/
git commit -m "feat: add _tokenize, _bm25_scores, _rrf_merge helpers with tests"
```

---

## Task 3: Add `_select_top_files` with tests

**Files:**
- Modify: `backend/app/services/vector_store.py`
- Modify: `backend/tests/test_vector_store_hybrid.py`

- [ ] **Step 1: Write failing tests for `_select_top_files`**

Append to `backend/tests/test_vector_store_hybrid.py`:
```python
from unittest.mock import MagicMock, patch
from langchain_core.documents import Document
from app.services.vector_store import _select_top_files


class TestSelectTopFiles:
    def _make_store(self, docs_by_file: dict[str, list[str]]) -> MagicMock:
        """Build a mock store with given {filename: [chunk_texts]}."""
        all_texts, all_metas = [], []
        for filename, texts in docs_by_file.items():
            for text in texts:
                all_texts.append(text)
                all_metas.append({"user_id": "u1", "source": filename, "folder": "f"})

        mock_store = MagicMock()
        mock_store.get.return_value = {"documents": all_texts, "metadatas": all_metas}

        # similarity_search_with_score returns first 3 chunks with high scores
        vec_results = []
        for text, meta in zip(all_texts[:3], all_metas[:3]):
            vec_results.append((Document(page_content=text, metadata=meta), 0.9))
        mock_store.similarity_search_with_score.return_value = vec_results
        return mock_store

    @patch("app.services.vector_store.get_store")
    def test_selects_keyword_relevant_file_first(self, mock_get_store):
        mock_get_store.return_value = self._make_store({
            "quantum.pdf": ["量子計算是未來科技", "量子糾纏現象"],
            "cats.pdf": ["貓咪很可愛"],
        })
        result = _select_top_files("量子", scope_filter={"user_id": "u1"}, top_n=2)
        assert result[0] == ("u1", "quantum.pdf")

    @patch("app.services.vector_store.get_store")
    def test_returns_at_most_top_n_files(self, mock_get_store):
        mock_get_store.return_value = self._make_store({
            "a.pdf": ["content a"],
            "b.pdf": ["content b"],
            "c.pdf": ["content c"],
        })
        result = _select_top_files("content", scope_filter={"user_id": "u1"}, top_n=2)
        assert len(result) <= 2

    @patch("app.services.vector_store.get_store")
    def test_empty_corpus_returns_empty(self, mock_get_store):
        mock_store = MagicMock()
        mock_store.get.return_value = {"documents": [], "metadatas": []}
        mock_get_store.return_value = mock_store
        result = _select_top_files("query", scope_filter={"user_id": "u1"}, top_n=5)
        assert result == []

    @patch("app.services.vector_store.get_store")
    def test_returns_tuples_of_user_id_and_filename(self, mock_get_store):
        mock_get_store.return_value = self._make_store({"doc.pdf": ["some text"]})
        result = _select_top_files("text", scope_filter={"user_id": "u1"}, top_n=5)
        assert all(isinstance(r, tuple) and len(r) == 2 for r in result)
        assert result[0] == ("u1", "doc.pdf")
```

- [ ] **Step 2: Run — confirm failure**

```bash
cd backend && python -m pytest tests/test_vector_store_hybrid.py::TestSelectTopFiles -v 2>&1 | head -20
```

Expected: `ImportError` (function not defined yet)

- [ ] **Step 3: Add `_select_top_files` to vector_store.py**

Add this function after `_rrf_merge` (before `_store: Chroma | None = None`):
```python
def _select_top_files(
    query: str,
    scope_filter: dict,
    top_n: int,
) -> list[tuple[str, str]]:
    """Stage 1: identify the top_n most relevant (user_id, filename) pairs via hybrid scoring."""
    store = get_store()
    result = store.get(where=scope_filter, include=["documents", "metadatas"])
    texts: list[str] = result.get("documents") or []
    metadatas: list[dict] = result.get("metadatas") or []
    if not texts:
        return []

    # BM25: aggregate best chunk score per file
    chunk_scores = _bm25_scores(query, texts)
    file_best_bm25: dict[tuple[str, str], float] = {}
    for i, meta in enumerate(metadatas):
        fk = (meta.get("user_id", ""), meta.get("source", ""))
        if fk[1]:
            file_best_bm25[fk] = max(file_best_bm25.get(fk, 0.0), chunk_scores[i])
    bm25_file_order = sorted(file_best_bm25, key=lambda fk: file_best_bm25[fk], reverse=True)

    # Vector: first-appearance order of files in top-20 results
    k_vec = min(20, len(texts))
    vector_results = store.similarity_search_with_score(query, k=k_vec, filter=scope_filter)
    seen: set[tuple[str, str]] = set()
    vector_file_order: list[tuple[str, str]] = []
    for doc, _ in vector_results:
        fk = (doc.metadata.get("user_id", ""), doc.metadata.get("source", ""))
        if fk[1] and fk not in seen:
            seen.add(fk)
            vector_file_order.append(fk)
    for fk in bm25_file_order:
        if fk not in seen:
            vector_file_order.append(fk)

    # File-level RRF merge
    all_files = list(file_best_bm25)
    rrf_scores: dict[tuple[str, str], float] = {fk: 0.0 for fk in all_files}
    for rank, fk in enumerate(bm25_file_order):
        rrf_scores[fk] += 1.0 / (60 + rank)
    for rank, fk in enumerate(vector_file_order):
        if fk in rrf_scores:
            rrf_scores[fk] += 1.0 / (60 + rank)

    return sorted(all_files, key=lambda fk: rrf_scores[fk], reverse=True)[:top_n]
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd backend && python -m pytest tests/test_vector_store_hybrid.py::TestSelectTopFiles -v
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/vector_store.py backend/tests/test_vector_store_hybrid.py
git commit -m "feat: add _select_top_files (Stage 1 file selection)"
```

---

## Task 4: Rewrite `similarity_search_comprehensive`

**Files:**
- Modify: `backend/app/services/vector_store.py`
- Modify: `backend/tests/test_vector_store_hybrid.py`

- [ ] **Step 1: Write failing tests for the rewritten function**

Append to `backend/tests/test_vector_store_hybrid.py`:
```python
from app.services.vector_store import similarity_search_comprehensive


class TestSimilaritySearchComprehensive:
    @patch("app.services.vector_store.get_store")
    @patch("app.services.vector_store.list_files_in_scope")
    @patch("app.services.vector_store.settings")
    def test_returns_empty_when_no_files(self, mock_settings, mock_list_files, mock_get_store):
        mock_settings.retrieval_top_files = 8
        mock_list_files.return_value = []
        result = similarity_search_comprehensive("query", user_id="u1")
        assert result == []

    @patch("app.services.vector_store.get_store")
    @patch("app.services.vector_store.list_files_in_scope")
    @patch("app.services.vector_store.settings")
    def test_skips_stage1_when_files_leq_top_n(self, mock_settings, mock_list_files, mock_get_store):
        mock_settings.retrieval_top_files = 8
        mock_list_files.return_value = [("u1", "doc.pdf")]  # 1 file < 8

        mock_store = MagicMock()
        mock_get_store.return_value = mock_store
        mock_store.get.return_value = {
            "documents": ["cats are great"],
            "metadatas": [{"user_id": "u1", "source": "doc.pdf", "folder": "f"}],
        }
        mock_store.similarity_search.return_value = [
            Document(page_content="cats are great", metadata={"user_id": "u1", "source": "doc.pdf"})
        ]

        result = similarity_search_comprehensive("cats", user_id="u1")
        assert len(result) == 1
        assert result[0].page_content == "cats are great"
        # store.get called once for the file (Stage 2), NOT for _select_top_files
        assert mock_store.similarity_search_with_score.call_count == 0

    @patch("app.services.vector_store.get_store")
    @patch("app.services.vector_store.list_files_in_scope")
    @patch("app.services.vector_store._select_top_files")
    @patch("app.services.vector_store.settings")
    def test_calls_stage1_when_files_exceed_top_n(
        self, mock_settings, mock_select, mock_list_files, mock_get_store
    ):
        mock_settings.retrieval_top_files = 2
        mock_list_files.return_value = [("u1", "a.pdf"), ("u1", "b.pdf"), ("u1", "c.pdf")]
        mock_select.return_value = [("u1", "a.pdf"), ("u1", "b.pdf")]

        mock_store = MagicMock()
        mock_get_store.return_value = mock_store
        mock_store.get.return_value = {
            "documents": ["content"],
            "metadatas": [{"user_id": "u1", "source": "a.pdf", "folder": "f"}],
        }
        mock_store.similarity_search.return_value = []

        similarity_search_comprehensive("query", user_id="u1")
        mock_select.assert_called_once()

    @patch("app.services.vector_store.get_store")
    @patch("app.services.vector_store.list_files_in_scope")
    @patch("app.services.vector_store.settings")
    def test_returns_document_objects(self, mock_settings, mock_list_files, mock_get_store):
        mock_settings.retrieval_top_files = 8
        mock_list_files.return_value = [("u1", "doc.pdf")]

        mock_store = MagicMock()
        mock_get_store.return_value = mock_store
        mock_store.get.return_value = {
            "documents": ["chunk one", "chunk two"],
            "metadatas": [
                {"user_id": "u1", "source": "doc.pdf", "folder": "f"},
                {"user_id": "u1", "source": "doc.pdf", "folder": "f"},
            ],
        }
        mock_store.similarity_search.return_value = [
            Document(page_content="chunk one", metadata={"user_id": "u1", "source": "doc.pdf"})
        ]

        result = similarity_search_comprehensive("query", user_id="u1")
        assert all(isinstance(d, Document) for d in result)
        assert all(d.metadata.get("source") == "doc.pdf" for d in result)
```

- [ ] **Step 2: Run — confirm tests fail with current implementation**

```bash
cd backend && python -m pytest tests/test_vector_store_hybrid.py::TestSimilaritySearchComprehensive -v 2>&1 | head -30
```

Expected: failures (current implementation doesn't match new behaviour)

- [ ] **Step 3: Rewrite `similarity_search_comprehensive` in vector_store.py**

Replace the existing `similarity_search_comprehensive` function (lines 132–159) with:
```python
def similarity_search_comprehensive(
    query: str,
    user_id: str,
    folders: list[str] | None = None,
    shared_accesses: list[tuple[str, str]] | None = None,
) -> list[Document]:
    """Two-stage hybrid retrieval.

    Stage 1: select top RETRIEVAL_TOP_FILES files via BM25 + vector RRF.
    Stage 2: deep per-file hybrid search for each selected file.
    Falls back to selecting all files when count <= retrieval_top_files.
    """
    # Build scope filter
    if folders:
        own_clause: dict = {"$and": [{"user_id": user_id}, {"folder": {"$in": folders}}]}
    else:
        own_clause = {"user_id": user_id}
    conditions: list[dict] = [own_clause]
    for owner_id, folder_name in (shared_accesses or []):
        conditions.append({"$and": [{"user_id": owner_id}, {"folder": folder_name}]})
    scope_filter = {"$or": conditions} if len(conditions) > 1 else conditions[0]

    all_files = list_files_in_scope(user_id, folders, shared_accesses)
    if not all_files:
        return []

    top_n = settings.retrieval_top_files
    if len(all_files) <= top_n:
        selected_files = all_files
    else:
        selected_files = _select_top_files(query, scope_filter, top_n)
        if not selected_files:
            selected_files = all_files[:top_n]

    # Stage 2: deep hybrid retrieval per selected file
    store = get_store()
    chunks_per_file = max(1, _MAX_TOTAL_CHUNKS // len(selected_files))
    all_docs: list[Document] = []

    for file_user_id, filename in selected_files:
        file_filter = {"$and": [{"user_id": file_user_id}, {"source": filename}]}
        file_result = store.get(where=file_filter, include=["documents", "metadatas"])
        texts: list[str] = file_result.get("documents") or []
        metas: list[dict] = file_result.get("metadatas") or []
        if not texts:
            continue

        # BM25 ranking for this file's chunks
        bm25_scores_list = _bm25_scores(query, texts)
        bm25_order = sorted(range(len(texts)), key=lambda i: bm25_scores_list[i], reverse=True)

        # Vector ranking for this file's chunks
        k_vec = min(chunks_per_file * 2, len(texts))
        vec_docs = store.similarity_search(query, k=k_vec, filter=file_filter)
        vec_content: set[str] = {d.page_content for d in vec_docs}
        vector_order = [i for i, t in enumerate(texts) if t in vec_content]
        remaining = [i for i in range(len(texts)) if i not in set(vector_order)]
        vector_order.extend(remaining)

        # RRF merge, take top chunks_per_file
        merged = _rrf_merge(bm25_order, vector_order)
        for i in merged[:chunks_per_file]:
            all_docs.append(Document(
                page_content=texts[i],
                metadata=metas[i] if i < len(metas) else {},
            ))

    return all_docs
```

- [ ] **Step 4: Run all tests**

```bash
cd backend && python -m pytest tests/test_vector_store_hybrid.py -v
```

Expected: all tests pass, 0 failures

- [ ] **Step 5: Smoke-test the server starts without errors**

```bash
cd backend && uvicorn app.main:app --port 8001 &
sleep 3
curl -s http://localhost:8001/health
kill %1
```

Expected: health endpoint responds (200 or any JSON — confirms no import errors)

- [ ] **Step 6: Final commit**

```bash
git add backend/app/services/vector_store.py backend/tests/test_vector_store_hybrid.py
git commit -m "feat: two-stage hybrid retrieval in similarity_search_comprehensive"
```
