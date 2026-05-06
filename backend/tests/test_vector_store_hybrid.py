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
        result = _rrf_merge([1, 0, 2], [1, 2, 0])
        assert result[0] == 1

    def test_consistent_ranking(self):
        # bm25: [0,1,2], vector: [2,0,1]
        # 0: 1/60 + 1/61, 1: 1/61 + 1/62, 2: 1/62 + 1/60 → 0 wins
        result = _rrf_merge([0, 1, 2], [2, 0, 1])
        assert result[0] == 0

    def test_empty_lists(self):
        assert _rrf_merge([], []) == []

    def test_single_element(self):
        assert _rrf_merge([0], [0]) == [0]


from unittest.mock import MagicMock, patch
from langchain_core.documents import Document
from app.services.vector_store import _select_top_files


class TestSelectTopFiles:
    def _make_store(self, docs_by_file: dict) -> MagicMock:
        all_texts, all_metas = [], []
        for filename, texts in docs_by_file.items():
            for text in texts:
                all_texts.append(text)
                all_metas.append({"user_id": "u1", "source": filename, "folder": "f"})
        mock_store = MagicMock()
        mock_store.get.return_value = {"documents": all_texts, "metadatas": all_metas}
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
        mock_list_files.return_value = [("u1", "doc.pdf")]

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
