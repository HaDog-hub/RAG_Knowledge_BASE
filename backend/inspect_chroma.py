"""
Quick ChromaDB inspector — run from the backend/ directory:
    python inspect_chroma.py
"""
from collections import defaultdict

import chromadb


CHROMA_DIR = "./chroma_db"
COLLECTION = "knowledge_base"

    
def main():
    client = chromadb.PersistentClient(path=CHROMA_DIR)

    collections = client.list_collections()
    print(f"Collections: {[c.name for c in collections]}\n")

    try:
        col = client.get_collection(COLLECTION)
    except Exception:
        print(f'Collection "{COLLECTION}" not found.')
        return

    result = col.get(include=["metadatas"])
    metadatas = result["metadatas"]
    total_chunks = len(metadatas)

    if total_chunks == 0:
        print("ChromaDB is empty — no documents uploaded yet.")
        return

    # Build tree: user_id -> folder -> set of filenames
    tree: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for m in metadatas:
        uid = m.get("user_id", "(unknown)")
        folder = m.get("folder") or "未分類"
        source = m.get("source", "(unknown)")
        tree[uid][folder].add(source)

    # Count chunks per file for details
    chunk_count: dict[tuple[str, str, str], int] = defaultdict(int)
    for m in metadatas:
        key = (
            m.get("user_id", "(unknown)"),
            m.get("folder") or "未分類",
            m.get("source", "(unknown)"),
        )
        chunk_count[key] += 1

    # Print
    total_files = 0
    for uid, folders in sorted(tree.items()):
        print(f"User: {uid}")
        for folder, files in sorted(folders.items()):
            print(f"  Folder: {folder}  ({len(files)} files)")
            for fname in sorted(files):
                chunks = chunk_count[(uid, folder, fname)]
                print(f"    {fname}  [{chunks} chunks]")
                total_files += 1
        print()

    print(f"Total  files : {total_files}")
    print(f"Total chunks : {total_chunks}")


if __name__ == "__main__":
    main()
