# 對話紀錄功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 RAG 知識庫加上自動儲存的對話紀錄功能，使用者可從 sidebar 切換到「對話」tab、新建/叫回/改名/刪除任一對話，叫回時連同當時的資料夾選擇一起還原。

**Architecture:** 後端在 SQLite 新增 `conversations` 與 `messages` 兩張正規化表，配合一個新的 `/api/conversations` REST router；標題在第一輪問答結束後由 `gpt-4o-mini` 產生。前端在 `BookshelfPanel` 頂端加 tab 切換書架/對話，在 `App.jsx` 加上 `currentConvId` 與 `conversations` 兩個狀態，整合 `handleSend` 完成時自動寫回後端。

**Tech Stack:** FastAPI / SQLAlchemy 2.0 (`Mapped[]` 風格) / SQLite / LangChain (`gpt-4o-mini`) / React + Tailwind / fetch

**Project conventions:**
- 此專案目前沒有單元測試框架。每個任務以「啟動服務 → 用 Swagger /docs 或瀏覽器手動驗收」作為驗證步驟
- 此專案目前不是 git repo（`Is a git repository: false`），所以 commit 步驟不在計畫中。若你執行前先 `git init`，建議每個 task 結束做一次 commit

**Spec reference:** `docs/superpowers/specs/2026-04-19-conversation-history-design.md`

---

## Task 1: Conversation + Message ORM models

**Files:**
- Create: `backend/app/models/conversation.py`
- Modify: `backend/app/database.py`（在 `init_db` 內 import 新模型以註冊到 `Base.metadata`）

- [ ] **Step 1: 建立 model 檔案**

寫入 `backend/app/models/conversation.py`：

```python
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str | None] = mapped_column(String(100), nullable=True)
    folders_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.id",
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list[str], null for user messages
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
```

- [ ] **Step 2: 在 `init_db` 註冊新模型**

修改 `backend/app/database.py:31`，把 import 行擴充：

```python
from app.models import user, folder_share, document_summary, folder_settings, conversation  # noqa: F401 — register models with Base
```

- [ ] **Step 3: 啟動服務驗證 schema 建立**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
```

預期：服務正常啟動無錯誤；首次啟動會在 `users.db` 建立 `conversations` 與 `messages` 兩張新表。

驗證表存在：

```bash
python -c "import sqlite3; c = sqlite3.connect('users.db'); print([r[0] for r in c.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()])"
```

預期輸出包含 `conversations` 與 `messages`。

---

## Task 2: 註冊空 router + 接到 `main.py`

**Files:**
- Create: `backend/app/routers/conversations.py`
- Modify: `backend/app/main.py`（import 與 include_router）

- [ ] **Step 1: 建立空 router 檔案**

寫入 `backend/app/routers/conversations.py`：

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.auth import get_current_user

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("/_ping")
async def ping(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Smoke-test endpoint — remove after Task 7."""
    return {"ok": True, "user_id": current_user.id}
```

- [ ] **Step 2: 在 `main.py` 註冊 router**

修改 `backend/app/main.py:10`：

```python
from app.routers import auth, conversations, documents, folders, query, search
```

並在 `app.include_router(search.router)` 下面加：

```python
app.include_router(conversations.router)
```

- [ ] **Step 3: 啟動服務 + 在 `/docs` 驗證**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
```

打開 `http://localhost:8000/docs`，預期看到新的 `conversations` tag，下面有 `GET /api/conversations/_ping`。

---

## Task 3: 列表 / 建立 / 刪除三個 endpoint

**Files:**
- Modify: `backend/app/routers/conversations.py`

- [ ] **Step 1: 加入 helper 與 schema**

在 `backend/app/routers/conversations.py` 的 import 之後加入：

```python
import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.conversation import Conversation, Message
from app.models.user import User
from app.services.auth import get_current_user


def _parse_folders(folders_json: str) -> list[str]:
    try:
        v = json.loads(folders_json)
        return v if isinstance(v, list) else []
    except (ValueError, TypeError):
        return []


def _get_user_conv_or_404(db: Session, conv_id: int, user_id: str) -> Conversation:
    conv = db.get(Conversation, conv_id)
    if conv is None or conv.user_id != user_id:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conv


class CreateConversationRequest(BaseModel):
    folders: list[str] = []
```

（保留 `router = APIRouter(...)` 行，刪掉 `_ping` 端點）

- [ ] **Step 2: 實作 `GET /api/conversations`（列表）**

加到 router：

```python
@router.get("")
async def list_conversations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    rows = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )
    return [
        {
            "id": c.id,
            "title": c.title,
            "folders": _parse_folders(c.folders_json),
            "updated_at": c.updated_at.isoformat(),
        }
        for c in rows
    ]
```

- [ ] **Step 3: 實作 `POST /api/conversations`（建立）**

```python
@router.post("")
async def create_conversation(
    body: CreateConversationRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    conv = Conversation(
        user_id=current_user.id,
        title=None,
        folders_json=json.dumps(body.folders, ensure_ascii=False),
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return {
        "id": conv.id,
        "title": conv.title,
        "folders": _parse_folders(conv.folders_json),
        "updated_at": conv.updated_at.isoformat(),
    }
```

- [ ] **Step 4: 實作 `DELETE /api/conversations/{id}`**

```python
@router.delete("/{conv_id}")
async def delete_conversation(
    conv_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    conv = _get_user_conv_or_404(db, conv_id, current_user.id)
    db.delete(conv)
    db.commit()
    return {"ok": True}
```

- [ ] **Step 5: 在 Swagger UI 手動驗收**

啟動服務，打開 `http://localhost:8000/docs`：
1. 先用 `POST /api/auth/login` 取得 token，按右上 `Authorize` 貼上
2. `POST /api/conversations` body `{"folders": ["test"]}` → 預期回 `{id: 1, title: null, folders: ["test"], ...}`
3. `GET /api/conversations` → 預期看到剛剛那筆
4. `DELETE /api/conversations/1` → 預期 `{ok: true}`
5. 再 `GET /api/conversations` → 預期空陣列

---

## Task 4: 取得對話詳情（含訊息）

**Files:**
- Modify: `backend/app/routers/conversations.py`

- [ ] **Step 1: 加 helper 處理 sources_json**

在 `_parse_folders` 下方加：

```python
def _parse_sources(sources_json: str | None) -> list[str]:
    if not sources_json:
        return []
    try:
        v = json.loads(sources_json)
        return v if isinstance(v, list) else []
    except (ValueError, TypeError):
        return []
```

- [ ] **Step 2: 實作 `GET /api/conversations/{id}`**

加到 router（放在 `list_conversations` 後面）：

```python
@router.get("/{conv_id}")
async def get_conversation(
    conv_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    conv = _get_user_conv_or_404(db, conv_id, current_user.id)
    return {
        "id": conv.id,
        "title": conv.title,
        "folders": _parse_folders(conv.folders_json),
        "updated_at": conv.updated_at.isoformat(),
        "messages": [
            {
                "role": m.role,
                "content": m.content,
                "sources": _parse_sources(m.sources_json),
            }
            for m in conv.messages
        ],
    }
```

- [ ] **Step 3: 在 Swagger UI 驗收**

1. `POST /api/conversations` 建一筆，記下 `id`
2. `GET /api/conversations/{id}` → 預期 `messages: []`
3. `GET /api/conversations/99999`（不存在）→ 預期 404
4. 用另一個帳號登入，`GET /api/conversations/{id}` 同樣 id → 預期 404（不是 200，不能洩漏其他人的對話存在）

---

## Task 5: 改名（PATCH）

**Files:**
- Modify: `backend/app/routers/conversations.py`

- [ ] **Step 1: 加 schema**

在 `CreateConversationRequest` 下方加：

```python
class RenameConversationRequest(BaseModel):
    title: str
```

- [ ] **Step 2: 實作 `PATCH /api/conversations/{id}`**

```python
@router.patch("/{conv_id}")
async def rename_conversation(
    conv_id: int,
    body: RenameConversationRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="標題不能為空。")
    if len(title) > 100:
        raise HTTPException(status_code=400, detail="標題不能超過 100 字元。")
    conv = _get_user_conv_or_404(db, conv_id, current_user.id)
    conv.title = title
    db.commit()
    return {"ok": True}
```

- [ ] **Step 3: Swagger 驗收**

`PATCH /api/conversations/{id}` body `{"title": "我的新標題"}` → `{ok: true}`，再 `GET` 確認標題已更新。
空字串、超長字串應分別回 400。

---

## Task 6: 在 `llm.py` 加 `generate_title()`

**Files:**
- Modify: `backend/app/services/llm.py`

- [ ] **Step 1: 加 prompt 與 function**

在 `SUMMARIZE_PROMPT` 下方（`generate_summary` 之前）加：

```python
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
```

- [ ] **Step 2: 在 Python REPL 快速驗證**

```bash
cd backend && python -c "from app.services.llm import generate_title; print(generate_title('什麼是 RAG?', 'RAG 是一種結合檢索與生成的 AI 技術，用於根據外部知識庫回答問題。'))"
```

預期：印出一個 6–10 字的標題（例如「RAG 技術簡介」）。若無 OpenAI 金鑰，預期印出 `什麼是 RAG?`（fallback）。

---

## Task 7: 寫入訊息 + 首輪自動生成標題

**Files:**
- Modify: `backend/app/routers/conversations.py`

- [ ] **Step 1: import title generator + schema**

在 `backend/app/routers/conversations.py` 頂端 imports 加：

```python
from app.services.llm import generate_title
```

並在 `RenameConversationRequest` 下方加：

```python
class AddMessagesRequest(BaseModel):
    user_msg: str
    assistant_msg: str
    sources: list[str] = []
```

- [ ] **Step 2: 實作 `POST /api/conversations/{id}/messages`**

加到 router：

```python
@router.post("/{conv_id}/messages")
async def add_messages(
    conv_id: int,
    body: AddMessagesRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    conv = _get_user_conv_or_404(db, conv_id, current_user.id)

    # Append user message + assistant message in one transaction
    db.add(Message(
        conversation_id=conv.id,
        role="user",
        content=body.user_msg,
        sources_json=None,
    ))
    db.add(Message(
        conversation_id=conv.id,
        role="assistant",
        content=body.assistant_msg,
        sources_json=json.dumps(body.sources, ensure_ascii=False) if body.sources else None,
    ))

    # First turn → generate title
    new_title: str | None = None
    if conv.title is None:
        new_title = generate_title(body.user_msg, body.assistant_msg)
        conv.title = new_title

    conv.updated_at = datetime.now(timezone.utc)
    db.commit()

    response: dict = {"ok": True}
    if new_title is not None:
        response["title"] = new_title
    return response
```

- [ ] **Step 3: Swagger 驗收**

1. `POST /api/conversations` body `{"folders": []}` 取得 `id`
2. `POST /api/conversations/{id}/messages` body：
   ```json
   {"user_msg": "RAG 是什麼", "assistant_msg": "RAG 是檢索增強生成", "sources": ["doc1.pdf"]}
   ```
   預期回應含 `title` 欄位（非空）
3. 再呼叫一次同一個 endpoint（第二輪）：預期回應只有 `{ok: true}`，無 `title`
4. `GET /api/conversations/{id}` → 預期看到 4 則訊息（2 user + 2 assistant），第一則 assistant 的 sources 是 `["doc1.pdf"]`，conversation 有標題
5. `GET /api/conversations` → 預期該對話的 `updated_at` 已更新為最新

---

## Task 8: ConversationList 元件（純 UI）

**Files:**
- Create: `frontend/src/components/ConversationList.jsx`

- [ ] **Step 1: 建立元件**

寫入 `frontend/src/components/ConversationList.jsx`：

```jsx
import { useState } from "react";

function formatRelativeTime(isoString) {
  const t = new Date(isoString);
  const now = new Date();
  const diffMs = now - t;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "剛剛";
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  const isToday = t.toDateString() === now.toDateString();
  if (isToday) return `今天 ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (t.toDateString() === yesterday.toDateString()) return "昨天";
  return `${t.getMonth() + 1}/${t.getDate()}`;
}

export default function ConversationList({
  conversations,
  currentConvId,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  disabled = false,
}) {
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const startRename = (conv) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title ?? "");
    setMenuOpenId(null);
  };

  const commitRename = (conv) => {
    const v = renameValue.trim();
    if (v && v !== conv.title) onRename(conv.id, v);
    setRenamingId(null);
  };

  return (
    <div className="flex flex-col h-full">
      <button
        onClick={onNewChat}
        disabled={disabled}
        className="m-3 px-3 py-2 rounded-lg text-sm font-medium bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
        title={disabled ? "等待回應結束" : "開新對話"}
      >
        <span className="text-base leading-none">+</span> 新對話
      </button>

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
        {conversations.length === 0 ? (
          <div className="text-center text-xs text-zinc-400 dark:text-zinc-500 mt-8 px-4">
            還沒有對話紀錄，<br />開始問第一個問題吧
          </div>
        ) : (
          conversations.map((c) => {
            const isActive = c.id === currentConvId;
            const isRenaming = renamingId === c.id;
            return (
              <div
                key={c.id}
                onClick={() => !disabled && !isRenaming && onSelect(c.id)}
                className={`group relative rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  disabled
                    ? "cursor-not-allowed opacity-60"
                    : isRenaming
                    ? "cursor-default"
                    : "cursor-pointer"
                } ${
                  isActive
                    ? "bg-zinc-200 dark:bg-zinc-700 border-l-2 border-amber-500"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
                title={disabled ? "等待回應結束" : c.title ?? "未命名對話"}
              >
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitRename(c); }
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => setRenamingId(null)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-white dark:bg-zinc-900 border border-amber-400 rounded px-1.5 py-0.5 text-sm focus:outline-none"
                  />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-zinc-800 dark:text-zinc-100 truncate min-w-0 flex-1">
                        {c.title ?? "未命名對話"}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === c.id ? null : c.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded hover:bg-zinc-300 dark:hover:bg-zinc-600 flex items-center justify-center text-zinc-500 dark:text-zinc-400 shrink-0"
                        title="更多"
                      >
                        ⋯
                      </button>
                    </div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                      {formatRelativeTime(c.updated_at)}
                    </div>
                    {menuOpenId === c.id && (
                      <div
                        className="absolute right-2 top-9 z-10 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-md shadow-md py-1 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => startRename(c)}
                          className="block w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
                        >
                          改名
                        </button>
                        <button
                          onClick={() => { onDelete(c); setMenuOpenId(null); }}
                          className="block w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-red-600 dark:text-red-400"
                        >
                          刪除
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 不接 API，純元件編譯確認**

啟動 frontend：

```bash
cd frontend && npm run dev
```

預期：build 不報錯（元件還沒被 import 所以 UI 上看不到）。瀏覽器主控台無 syntax error。

---

## Task 9: BookshelfPanel 加 tab 切換

**Files:**
- Modify: `frontend/src/components/BookshelfPanel.jsx`

- [ ] **Step 1: 加 tab state 與 props**

在 `BookshelfPanel` 元件最頂端（其它 useState 旁）加：

```jsx
const [sidebarTab, setSidebarTab] = useState("library"); // "library" | "conversations"
```

並讓 `BookshelfSidebar`（即 default export）接收新的 props（在最終的 JSX `return` 之前先解構新的 props，並傳遞給後續即將在 Task 12 加的 ConversationList）：

在元件參數簽章加入這幾個 props（保留既有的 props）：

```jsx
export default function BookshelfPanel({
  folderMap, folderSettings, sharedFolders, onRefresh, authFetch, username, onLogout,
  conversations = [], currentConvId = null,
  onNewChat = () => {}, onSelectConv = () => {}, onRenameConv = () => {}, onDeleteConv = () => {},
  streaming = false,
}) {
```

- [ ] **Step 2: 在 user header 下方插入 tab 列**

找到既有的 sidebar header 區塊（顯示 username + 登出按鈕的那一段），在它下方插入：

```jsx
<div className="flex border-b border-zinc-200 dark:border-zinc-700 shrink-0">
  {[["library", "📚 書架"], ["conversations", "💬 對話"]].map(([key, label]) => (
    <button
      key={key}
      onClick={() => setSidebarTab(key)}
      className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
        sidebarTab === key
          ? "text-zinc-900 dark:text-zinc-100 border-b-2 border-amber-500 -mb-px bg-white dark:bg-zinc-800"
          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  ))}
</div>
```

- [ ] **Step 3: 用 tab 切換主內容**

把 sidebar 既有的「書架內容」區塊（FolderTree、上傳按鈕、新增資料夾按鈕、共享給我區塊等）整段用條件 wrap：

```jsx
{sidebarTab === "library" ? (
  <>
    {/* ── 既有的書架 JSX 整段放這裡 ── */}
  </>
) : (
  <ConversationList
    conversations={conversations}
    currentConvId={currentConvId}
    onSelect={onSelectConv}
    onNewChat={onNewChat}
    onRename={onRenameConv}
    onDelete={onDeleteConv}
    disabled={streaming}
  />
)}
```

並在檔案頂端 import：

```jsx
import ConversationList from "./ConversationList";
```

- [ ] **Step 4: 瀏覽器 smoke test**

`npm run dev` 啟動，登入後：
- 預期 sidebar 頂端看到「📚 書架 / 💬 對話」兩個 tab
- 點「💬 對話」→ 預期看到「+ 新對話」按鈕 + 空狀態提示文字（因為 conversations 還沒接 API，是空陣列）
- 點「📚 書架」→ 回到原本書架介面
- 不論在哪個 tab，主聊天區不受影響

---

## Task 10: App.jsx 對話狀態 + 列表 fetch + 新建/叫回 handler

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: 加狀態**

在既有的 `const [selectedFolders, ...]` 下方加：

```jsx
const [conversations, setConversations] = useState([]);
const [currentConvId, setCurrentConvId] = useState(null);
```

- [ ] **Step 2: 加 fetch 列表函式 + 初次載入**

在既有的 `fetchFolderMap` 下方加：

```jsx
const fetchConversations = useCallback(async () => {
  try {
    const res = await authFetch(`${API}/api/conversations`);
    if (!res.ok) return;
    const data = await res.json();
    setConversations(Array.isArray(data) ? data : []);
  } catch { /* silent */ }
}, [authFetch]);
```

並把既有的 `useEffect(() => { if (auth) fetchFolderMap(); }, ...)` 改為：

```jsx
useEffect(() => {
  if (auth) {
    fetchFolderMap();
    fetchConversations();
  }
}, [auth, fetchFolderMap, fetchConversations]);
```

- [ ] **Step 3: logout 清空對話狀態**

修改既有的 `logout` callback，在現有的 setMessages/setFolderMap 等之後加：

```jsx
setConversations([]);
setCurrentConvId(null);
```

- [ ] **Step 4: 加 handleNewChat**

在 `handleSend` 上方加：

```jsx
const handleNewChat = useCallback(() => {
  if (loading || streaming) return;
  setMessages([]);
  setCurrentConvId(null);
}, [loading, streaming]);
```

- [ ] **Step 5: 加 handleRecall**

接著加：

```jsx
const handleRecall = useCallback(async (convId) => {
  if (loading || streaming) return;
  try {
    const res = await authFetch(`${API}/api/conversations/${convId}`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages((data.messages ?? []).map((m) => ({
      role: m.role,
      content: m.content,
      sources: m.sources ?? [],
    })));
    setCurrentConvId(convId);
    // Restore folder selection — silently filter folders that no longer exist
    const ownFolders = Object.keys(folderMap);
    const sharedFolderNames = sharedFolders.map((s) => s.folder);
    const validFolders = (data.folders ?? []).filter(
      (f) => ownFolders.includes(f) || sharedFolderNames.includes(f)
    );
    setSelectedFolders(validFolders);
    setMode("chat");
  } catch { /* silent */ }
}, [authFetch, loading, streaming, folderMap, sharedFolders]);
```

- [ ] **Step 6: 把 props 傳給 BookshelfSidebar**

修改 `<BookshelfSidebar ... />` 加上：

```jsx
<BookshelfSidebar
  folderMap={folderMap}
  folderSettings={folderSettings}
  sharedFolders={sharedFolders}
  onRefresh={fetchFolderMap}
  authFetch={authFetch}
  username={auth.username}
  onLogout={logout}
  conversations={conversations}
  currentConvId={currentConvId}
  onNewChat={handleNewChat}
  onSelectConv={handleRecall}
  onRenameConv={() => {}}     // Task 12
  onDeleteConv={() => {}}     // Task 12
  streaming={loading || streaming}
/>
```

- [ ] **Step 7: 瀏覽器 smoke test**

`npm run dev`，登入後：
- 切到「💬 對話」tab → 仍空（資料庫沒對話）
- 用 Swagger UI 手動 POST 一筆 conversation + 一輪 messages
- 重新整理 frontend → 切到「💬 對話」tab → 預期看到那筆對話
- 點該對話 → 預期主聊天區出現先前的訊息，FolderSelector 顯示對應的 folders（若該 folders 已被刪會被過濾掉）
- 點「+ 新對話」→ 預期主聊天區清空，左側不再有任何項目高亮

---

## Task 11: handleSend 整合 — 自動建立 + 自動寫回

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: 修改 handleSend 在發送前自動建對話**

把既有的 `handleSend = async (question) => { ... }` 改為以下版本（重點：在 `setMessages((prev) => [...prev, { role: "user", content: question }]);` 那行之前插入建對話邏輯，並在 streaming 結束後寫回後端）：

```jsx
const handleSend = async (question) => {
  const history = messages.map(({ role, content }) => ({ role, content }));
  setMessages((prev) => [...prev, { role: "user", content: question }]);
  setLoading(true);

  // Ensure we have a conversation id before streaming starts
  let convId = currentConvId;
  if (convId === null) {
    try {
      const res = await authFetch(`${API}/api/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folders: selectedFolders }),
      });
      if (res.ok) {
        const data = await res.json();
        convId = data.id;
        setCurrentConvId(convId);
        // Insert into list at the top so it's immediately visible
        setConversations((prev) => [
          { id: data.id, title: data.title, folders: data.folders, updated_at: data.updated_at },
          ...prev,
        ]);
      }
    } catch { /* silent — chat will still work, just won't be saved */ }
  }

  let assistantText = "";
  let assistantSources = [];

  try {
    const res = await authFetch(`${API}/api/query/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, k: 4, chat_history: history, folders: selectedFolders }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail ?? `HTTP ${res.status}`);
    }

    setLoading(false);
    setStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "", sources: [], streaming: true }]);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    loop: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";

      for (const part of parts) {
        if (!part.startsWith("data: ")) continue;
        let parsed;
        try { parsed = JSON.parse(part.slice(6)); } catch { continue; }

        if (typeof parsed === "string") {
          assistantText += parsed;
          setMessages((prev) => {
            const arr = [...prev];
            const i = arr.length - 1;
            if (arr[i]?.streaming) arr[i] = { ...arr[i], content: arr[i].content + parsed };
            return arr;
          });
        } else if (parsed.sources) {
          assistantSources = parsed.sources;
          setMessages((prev) => prev.map((m) => m.streaming ? { ...m, sources: parsed.sources } : m));
        } else if (parsed.done) {
          setMessages((prev) => prev.map((m) => m.streaming ? { ...m, streaming: false } : m));
          break loop;
        } else if (parsed.error) {
          assistantText = parsed.error;
          assistantSources = [];
          setMessages((prev) => prev.map((m) =>
            m.streaming ? { ...m, content: parsed.error, streaming: false } : m
          ));
          break loop;
        }
      }
    }
  } catch (err) {
    const msg = err?.message?.includes("Failed to fetch")
      ? "無法連線到伺服器，請確認 backend 是否運行。"
      : (err?.message ?? "查詢失敗，請稍後再試。");
    assistantText = msg;
    assistantSources = [];
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.streaming) {
        return [...prev.slice(0, -1), { role: "assistant", content: msg, sources: [] }];
      }
      return [...prev, { role: "assistant", content: msg, sources: [] }];
    });
  } finally {
    setLoading(false);
    setStreaming(false);
    setMessages((prev) => prev.map((m) => m.streaming ? { ...m, streaming: false } : m));

    // Persist this turn to the backend (best-effort, fire-and-forget; do not block UI)
    if (convId !== null && assistantText) {
      authFetch(`${API}/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_msg: question,
          assistant_msg: assistantText,
          sources: assistantSources,
        }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (!data) return;
          // Update list entry: bump updated_at, set title if first turn returned one
          setConversations((prev) => prev.map((c) => {
            if (c.id !== convId) return c;
            return {
              ...c,
              title: data.title ?? c.title,
              updated_at: new Date().toISOString(),
            };
          }));
          // Re-sort by updated_at desc
          setConversations((prev) => [...prev].sort(
            (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
          ));
        })
        .catch(() => { /* silent */ });
    }
  }
};
```

- [ ] **Step 2: 瀏覽器端到端驗證**

`npm run dev`，登入後：
1. 點「+ 新對話」確保乾淨狀態
2. 在主聊天區發送一個問題（例如「測試對話」）
3. 等 streaming 完成
4. 切到「💬 對話」tab → 預期看到一筆新對話，標題是 LLM 生成的（非「未命名對話」）
5. 再發送第二個問題 → 預期 sidebar 中該對話的時間更新（重排到最上）但標題不變
6. 點「+ 新對話」→ 主聊天區清空
7. 點 sidebar 中的舊對話 → 預期主聊天區還原所有訊息與 source badge

---

## Task 12: 改名 + 刪除 handler 接通

**Files:**
- Modify: `frontend/src/App.jsx`
- 重用：`frontend/src/components/ConfirmDialog.jsx`

- [ ] **Step 1: 加 deleteTarget state 與 handler**

在 `handleRecall` 之後加：

```jsx
const [deleteConvTarget, setDeleteConvTarget] = useState(null);

const handleRenameConv = useCallback(async (convId, newTitle) => {
  try {
    const res = await authFetch(`${API}/api/conversations/${convId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
    if (!res.ok) return;
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, title: newTitle } : c));
  } catch { /* silent */ }
}, [authFetch]);

const handleDeleteConvRequest = useCallback((conv) => {
  setDeleteConvTarget(conv);
}, []);

const handleDeleteConvConfirm = useCallback(async () => {
  const conv = deleteConvTarget;
  if (!conv) return;
  try {
    const res = await authFetch(`${API}/api/conversations/${conv.id}`, { method: "DELETE" });
    if (!res.ok) return;
    setConversations((prev) => prev.filter((c) => c.id !== conv.id));
    // If the deleted conversation was the currently open one, reset to fresh chat
    if (conv.id === currentConvId) {
      setMessages([]);
      setCurrentConvId(null);
    }
  } catch { /* silent */ } finally {
    setDeleteConvTarget(null);
  }
}, [deleteConvTarget, currentConvId, authFetch]);
```

- [ ] **Step 2: 把新的 handler 傳到 BookshelfSidebar**

修改既有的 `<BookshelfSidebar ...>` props，把先前佔位的 `() => {}` 換成實際 handler：

```jsx
onRenameConv={handleRenameConv}
onDeleteConv={handleDeleteConvRequest}
```

- [ ] **Step 3: 渲染 ConfirmDialog**

在 `App.jsx` 最外層 `<div className="flex h-screen ...">` 內最末尾（既有 main content `</div>` 之後、最外層結束之前）加：

```jsx
{deleteConvTarget && (
  <ConfirmDialog
    open={true}
    title="刪除對話"
    message={`確定刪除「${deleteConvTarget.title ?? "未命名對話"}」？此動作無法復原。`}
    confirmText="刪除"
    onConfirm={handleDeleteConvConfirm}
    onCancel={() => setDeleteConvTarget(null)}
  />
)}
```

並在檔案頂端 import：

```jsx
import ConfirmDialog from "./components/ConfirmDialog";
```

> 註：如果現有 `ConfirmDialog` 的 props 名稱跟上面不同，請以實際元件 API 為準。先打開 `frontend/src/components/ConfirmDialog.jsx` 確認 props 簽章，再對齊呼叫方式。

- [ ] **Step 4: 端到端驗證**

`npm run dev`，登入後：
1. 切到「💬 對話」tab，至少要有一筆對話
2. hover 一筆對話 → 右側出現 `⋯` → 點開選單 → 點「改名」
3. 進入 inline edit 模式，輸入新標題後按 Enter → 預期標題立即更新且 reload 後仍存在
4. 點「⋯」→「刪除」→ 預期跳出 ConfirmDialog
5. 確認刪除 → 該對話從列表消失；若刪的是目前正在看的對話，主聊天區應清空
6. 中途若主聊天區正在 streaming，`+ 新對話`、列表 hover 應 disabled 且顯示 not-allowed 游標

---

## Self-Review Notes

逐 spec 章節對照：
- 自動儲存 → Task 11（handleSend 在 finally 寫回）✓
- LLM 標題產生 + 改名 → Task 6（generate_title）+ Task 7（首輪觸發）+ Task 5（PATCH）+ Task 12（前端改名）✓
- Sidebar tab 切換 → Task 9 ✓
- 還原訊息 + folders 容錯 → Task 10 Step 5 ✓
- 「+ 新對話」按鈕 → Task 8 + Task 10 Step 4 ✓
- 刪除 + 確認對話 → Task 12 ✓
- ConfirmDialog 重用 → Task 12 Step 3 ✓
- Conversation + Message 正規化表 → Task 1 ✓
- 所有 endpoint 帶 user_id 過濾 + 404 不洩漏 → Task 3/4/5/7 + `_get_user_conv_or_404` ✓
- streaming 中 disabled 列表 → Task 8（disabled prop）+ Task 10（傳 streaming）✓
- 標題失敗 fallback → Task 6 ✓
- 寫入失敗 silent fail → Task 11 finally `.catch(() => {})` ✓
- 邊界：刪除目前正在看的 → Task 12 Step 1 ✓
- 邊界：被叫回對話 folders 全被刪 → Task 10 Step 5 filter 結果為 `[]` 等同搜尋全部 ✓
- 不在範圍內：搜尋對話、分組、匯出、分享、訊息編輯 → 計畫中未出現 ✓

無 placeholder、type 一致（`generate_title` 簽章一致、`_get_user_conv_or_404` 簽章一致、`AddMessagesRequest` 與前端 body 鍵名一致：`user_msg` / `assistant_msg` / `sources`）。
