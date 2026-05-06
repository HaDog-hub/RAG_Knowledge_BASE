import re

from langchain_chroma import Chroma
from langchain_core.documents import Document
from rank_bm25 import BM25Okapi

from app.config import settings
from app.services.embeddings import get_embeddings


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


_store: Chroma | None = None


def get_store() -> Chroma:
    global _store
    if _store is None:
        _store = Chroma(
            collection_name=settings.collection_name,
            embedding_function=get_embeddings(),
            persist_directory=settings.chroma_persist_dir,
        )
    return _store


def add_documents(documents: list[Document]) -> list[str]:
    return get_store().add_documents(documents)


def similarity_search(
    query: str,
    user_id: str,
    k: int = 4,
    folders: list[str] | None = None,
    shared_accesses: list[tuple[str, str]] | None = None,
) -> list[Document]:
    """Return top-k relevant documents.

    Searches the current user's own folders (optionally filtered) plus any
    shared folders from other users.

    shared_accesses: list of (owner_user_id, folder_name) tuples granted to
    the current user by other users.
    """
    # Own-folder condition
    if folders:
        own_clause: dict = {"$and": [{"user_id": user_id}, {"folder": {"$in": folders}}]}
    else:
        own_clause = {"user_id": user_id}

    conditions: list[dict] = [own_clause]

    for owner_id, folder_name in (shared_accesses or []):
        conditions.append({"$and": [{"user_id": owner_id}, {"folder": folder_name}]})

    where = {"$or": conditions} if len(conditions) > 1 else conditions[0]
    return get_store().similarity_search(query, k=k, filter=where)


def list_sources_by_folder(user_id: str) -> dict[str, list[str]]:
    result = get_store().get(where={"user_id": user_id}, include=["metadatas"])
    grouped: dict[str, set[str]] = {}
    for m in result["metadatas"]:
        folder = m.get("folder") or "未分類"
        source = m.get("source", "")
        if source:
            grouped.setdefault(folder, set()).add(source)
    return {f: sorted(files) for f, files in sorted(grouped.items())}


def get_files_in_folder(user_id: str, folder_name: str) -> list[str]:
    """Return unique filenames in a specific folder belonging to user_id."""
    result = get_store().get(
        where={"$and": [{"user_id": user_id}, {"folder": folder_name}]},
        include=["metadatas"],
    )
    sources = {m.get("source", "") for m in result["metadatas"]}
    return sorted(s for s in sources if s)


def move_source(filename: str, new_folder: str, user_id: str) -> int:
    store = get_store()
    result = store.get(
        where={"$and": [{"user_id": user_id}, {"source": filename}]},
        include=[],
    )
    ids = result["ids"]
    if ids:
        store._collection.update(
            ids=ids,
            metadatas=[{"source": filename, "folder": new_folder, "user_id": user_id}] * len(ids),
        )
    return len(ids)


_MAX_TOTAL_CHUNKS = 40  # context budget: caps total chunks sent to LLM


def list_files_in_scope(
    user_id: str,
    folders: list[str] | None = None,
    shared_accesses: list[tuple[str, str]] | None = None,
) -> list[tuple[str, str]]:
    """Return (owner_user_id, filename) for every file visible in the query scope."""
    store = get_store()
    seen: set[tuple[str, str]] = set()
    files: list[tuple[str, str]] = []

    # Own files
    where = (
        {"$and": [{"user_id": user_id}, {"folder": {"$in": folders}}]}
        if folders
        else {"user_id": user_id}
    )
    result = store.get(where=where, include=["metadatas"])
    for m in result["metadatas"]:
        key = (user_id, m.get("source", ""))
        if key[1] and key not in seen:
            seen.add(key)
            files.append(key)

    # Shared files
    for owner_id, folder_name in (shared_accesses or []):
        result = store.get(
            where={"$and": [{"user_id": owner_id}, {"folder": folder_name}]},
            include=["metadatas"],
        )
        for m in result["metadatas"]:
            key = (owner_id, m.get("source", ""))
            if key[1] and key not in seen:
                seen.add(key)
                files.append(key)

    return files


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


def get_document_chunks(filename: str, user_id: str) -> list[str]:
    """Return all chunk texts for a file (used for summarisation)."""
    result = get_store().get(
        where={"$and": [{"user_id": user_id}, {"source": filename}]},
        include=["documents"],
    )
    return result.get("documents") or []


def search_with_scores(
    query: str,
    user_id: str,
    k: int = 10,
    folders: list[str] | None = None,
    shared_accesses: list[tuple[str, str]] | None = None,
) -> list[tuple[Document, float]]:
    """Similarity search with scores — used by the search endpoint (no LLM)."""
    if folders:
        own_clause: dict = {"$and": [{"user_id": user_id}, {"folder": {"$in": folders}}]}
    else:
        own_clause = {"user_id": user_id}

    conditions: list[dict] = [own_clause]
    for owner_id, folder_name in (shared_accesses or []):
        conditions.append({"$and": [{"user_id": owner_id}, {"folder": folder_name}]})

    where = {"$or": conditions} if len(conditions) > 1 else conditions[0]
    return get_store().similarity_search_with_score(query, k=k, filter=where)


def delete_source(filename: str, user_id: str) -> int:
    store = get_store()
    result = store.get(
        where={"$and": [{"user_id": user_id}, {"source": filename}]},
        include=[],
    )
    ids = result["ids"]
    if ids:
        store.delete(ids=ids)
    return len(ids)


def rename_source(old_name: str, new_name: str, user_id: str) -> int:
    """Rename a file by updating the source metadata on all its chunks."""
    store = get_store()
    result = store.get(
        where={"$and": [{"user_id": user_id}, {"source": old_name}]},
        include=["metadatas"],
    )
    ids = result["ids"]
    if ids:
        new_metadatas = [{**m, "source": new_name} for m in result["metadatas"]]
        store._collection.update(ids=ids, metadatas=new_metadatas)
    return len(ids)


def rename_folder(old_name: str, new_name: str, user_id: str) -> int:
    """Rename a folder by updating the folder metadata on all its chunks."""
    store = get_store()
    result = store.get(
        where={"$and": [{"user_id": user_id}, {"folder": old_name}]},
        include=["metadatas"],
    )
    ids = result["ids"]
    if ids:
        new_metadatas = [{**m, "folder": new_name} for m in result["metadatas"]]
        store._collection.update(ids=ids, metadatas=new_metadatas)
    return len(ids)


def delete_folder(folder_name: str, user_id: str) -> int:
    """Delete all chunks belonging to a folder."""
    store = get_store()
    result = store.get(
        where={"$and": [{"user_id": user_id}, {"folder": folder_name}]},
        include=[],
    )
    ids = result["ids"]
    if ids:
        store.delete(ids=ids)
    return len(ids)
