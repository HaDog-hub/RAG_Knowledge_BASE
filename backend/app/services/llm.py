from typing import AsyncGenerator

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.documents import Document

from app.config import settings

_llm: ChatOpenAI | None = None

# Maximum number of chat history messages to send (prevents token overflow)
_MAX_HISTORY_MESSAGES = 20
# Max chars of document content sent to the summarise LLM call
_MAX_SUMMARY_CHARS = 20_000

SYSTEM_PROMPT = """You are a helpful assistant with access to a personal knowledge base. \
The context below contains excerpts from one or more documents — each excerpt is labelled with its source file and folder. \
Answer the user's question using only the information in the context. \
When the question asks for comparisons, summaries, or patterns across multiple documents, analyse all provided excerpts and give a comprehensive answer. \
Reply in the same language the user uses. Reply directly and naturally — do not open with phrases like "Based on the context" or "According to the provided information". \
If the context does not contain enough information to answer, say so honestly.

Context:
{context}"""


def get_llm() -> ChatOpenAI:
    global _llm
    if _llm is None:
        _llm = ChatOpenAI(
            model=settings.llm_model,
            openai_api_key=settings.openai_api_key,
            temperature=0,
        )
    return _llm


def generate_answer(
    question: str,
    docs: list[Document],
    chat_history: list[dict] | None = None,
) -> str:
    """Given a question, retrieved docs, and optional chat history, return LLM-generated answer."""
    messages = _build_messages(question, docs, chat_history)
    try:
        return StrOutputParser().invoke(get_llm().invoke(messages))
    except Exception as e:
        # Surface a user-friendly message rather than a raw 500 traceback
        error_type = type(e).__name__
        if "RateLimitError" in error_type or "rate_limit" in str(e).lower():
            raise RuntimeError("OpenAI API 配額已用完，請稍後再試或檢查 API 金鑰用量。")
        if "AuthenticationError" in error_type:
            raise RuntimeError("OpenAI API 金鑰無效，請檢查 .env 設定。")
        raise RuntimeError(f"LLM 呼叫失敗：{error_type}")


def _build_messages(
    question: str,
    docs: list[Document],
    chat_history: list[dict] | None = None,
):
    """Shared message-building logic for both streaming and non-streaming paths."""
    context_parts = []
    for doc in docs:
        source = doc.metadata.get("source", "")
        folder = doc.metadata.get("folder", "")
        label = " | ".join(filter(None, [source, folder]))
        prefix = f"[{label}]\n" if label else ""
        context_parts.append(f"{prefix}{doc.page_content}")
    context = "\n\n".join(context_parts)

    msgs = [SystemMessage(content=SYSTEM_PROMPT.format(context=context))]
    recent_history = (chat_history or [])[-_MAX_HISTORY_MESSAGES:]
    for turn in recent_history:
        if turn["role"] == "user":
            msgs.append(HumanMessage(content=turn["content"]))
        else:
            msgs.append(AIMessage(content=turn["content"]))
    msgs.append(HumanMessage(content=question))
    return msgs


SUMMARIZE_PROMPT = """你是一位專業的文件分析助手。以下是一份文件的完整內容（分段呈現）。
請用繁體中文生成一份結構清晰的摘要。

文件名稱：{filename}

內容：
{content}

請依以下結構回應：
**文件概述**
一句話說明文件的主題與類型。

**核心要點**
條列 3–5 個主要內容或重點段落。

**重要結論**
關鍵發現、數據或結論（若無則略過此項）。

摘要請控制在 400 字以內，直接輸出，勿加前綴說明。"""


TITLE_PROMPT = """以下是一段問答對話，請用繁體中文產生一個 6 到 10 個字之間的簡短標題。
- 只輸出標題本身，不要加引號、標點符號或前綴說明
- 標題要能反映問題的主題

問題：{question}

回答：{answer}

標題："""


def generate_title(question: str, answer: str) -> str:
    """Generate a 6–10 char Chinese title summarising the first Q&A turn.

    Falls back to question[:20] on any LLM error so the caller never has to
    handle exceptions — title generation must never block message persistence.
    """
    try:
        msg = HumanMessage(content=TITLE_PROMPT.format(question=question, answer=answer))
        raw = StrOutputParser().invoke(get_llm().invoke([msg]))
        title = raw.strip().strip("「」\"'")
        if not title:
            return question[:20]
        return title[:20]
    except Exception:
        return question[:20]


def generate_summary(filename: str, chunks: list[str]) -> str:
    """Generate a structured summary for a document given its chunk texts."""
    content = "\n\n---\n\n".join(chunks)
    if len(content) > _MAX_SUMMARY_CHARS:
        content = content[:_MAX_SUMMARY_CHARS] + "\n\n…（內容過長，已截斷）"

    messages = [HumanMessage(content=SUMMARIZE_PROMPT.format(filename=filename, content=content))]
    try:
        return StrOutputParser().invoke(get_llm().invoke(messages))
    except Exception as e:
        error_type = type(e).__name__
        if "RateLimitError" in error_type or "rate_limit" in str(e).lower():
            raise RuntimeError("OpenAI API 配額已用完，請稍後再試或檢查 API 金鑰用量。")
        if "AuthenticationError" in error_type:
            raise RuntimeError("OpenAI API 金鑰無效，請檢查 .env 設定。")
        raise RuntimeError(f"LLM 呼叫失敗：{error_type}")


async def stream_answer(
    question: str,
    docs: list[Document],
    chat_history: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """Yield LLM response tokens one by one via astream."""
    messages = _build_messages(question, docs, chat_history)
    try:
        async for chunk in get_llm().astream(messages):
            token = chunk.content
            if token:
                yield token
    except Exception as e:
        error_type = type(e).__name__
        if "RateLimitError" in error_type or "rate_limit" in str(e).lower():
            raise RuntimeError("OpenAI API 配額已用完，請稍後再試或檢查 API 金鑰用量。")
        if "AuthenticationError" in error_type:
            raise RuntimeError("OpenAI API 金鑰無效，請檢查 .env 設定。")
        raise RuntimeError(f"LLM 呼叫失敗：{error_type}")
