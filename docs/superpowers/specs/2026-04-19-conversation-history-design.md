# 對話紀錄功能 ・ 設計文件

**日期**：2026-04-19
**範圍**：RAG 知識庫的對話紀錄（Conversation History）功能

## 目標

為現有的 RAG Q&A 系統加上對話紀錄：使用者過去的問答自動儲存，可從 sidebar 叫回繼續、改名、刪除。

## 關鍵決策摘要

| 決策點 | 選擇 |
|---|---|
| 儲存時機 | 自動儲存（每輪問答結束時寫入） |
| 標題產生 | LLM 在第一輪後產生 6–10 字短標題；可手動改名；失敗 fallback 取問題前 20 字 |
| Sidebar 整合 | 同一 sidebar 加 tab 切換「📚 書架 / 💬 對話」 |
| 叫回行為 | 還原訊息 + 還原當時的 `folders` 選擇（容錯：已不存在的資料夾靜默過濾） |
| 開新對話 | 對話列表頂端「+ 新對話」按鈕；不預先建空對話，等使用者送第一則才建 |
| 資料模型 | 正規化兩個表（`Conversation` + `Message`） |

## 元件影響範圍

```
backend/
├── app/models/conversation.py           # 新增：Conversation + Message ORM
├── app/routers/conversations.py         # 新增：CRUD + 標題生成
├── app/services/llm.py                  # 修改：加 generate_title()
├── app/database.py                      # 修改：建表（create_all 自動處理）
└── app/main.py                          # 修改：註冊新 router

frontend/src/
├── App.jsx                              # 修改：currentConvId / conversations 狀態，整合 handleSend / 新增 handleNewChat / handleRecall
└── components/
    ├── BookshelfPanel.jsx               # 修改：頂端加 tab 切換書架/對話
    ├── ConversationList.jsx             # 新增：對話列表（新建、叫回、改名、刪除）
    └── (重用) ConfirmDialog             # 刪除確認
```

## 資料流（自動儲存）

```
User 發送訊息
   ↓
App.jsx handleSend()
   ↓
若 currentConvId 為 null → POST /api/conversations  ← 新建空對話，body 帶 folders 快照，拿到 conv_id
   ↓
POST /api/query/stream（照舊，純 RAG 邏輯）
   ↓
streaming 結束 → POST /api/conversations/{conv_id}/messages
   （body: user_msg + assistant_msg + sources）
   ↓
若這是第 1 輪 → 後端內部觸發 generate_title()，UPDATE conversation.title
回傳新標題
   ↓
Frontend 收到 title 後更新 conversations state（不需要重 fetch 整個列表）
```

關鍵設計選擇：
- 對話的 `folders` 快照在「第一次發送」時寫入並鎖定，之後不會跟著 `selectedFolders` 改變
- 標題生成失敗時 fallback 用 `question[:20]`，保證列表有東西顯示
- Streaming 進行中時，對話列表的點擊會被 disable，避免狀態錯亂

## 資料模型

### `Conversation`（`app/models/conversation.py`）

| 欄位 | 型別 | 備註 |
|---|---|---|
| `id` | Integer PK | autoincrement |
| `user_id` | Integer FK → users.id | 必填，所有查詢都加 user_id 條件 |
| `title` | String(100) nullable | 初始 null，第一輪後由 LLM 填入 |
| `folders_json` | Text | JSON 陣列字串，`'["筆記","論文"]'`；空陣列 = 全部 |
| `created_at` | DateTime | utcnow |
| `updated_at` | DateTime | 每次 add message 時更新（用於排序） |

### `Message`（同檔案）

| 欄位 | 型別 | 備註 |
|---|---|---|
| `id` | Integer PK | |
| `conversation_id` | Integer FK → conversations.id, ondelete=CASCADE | |
| `role` | String(16) | `"user"` / `"assistant"` |
| `content` | Text | |
| `sources_json` | Text nullable | JSON 陣列；user 訊息為 null |
| `created_at` | DateTime | utcnow |

`database.py` 啟動時 `Base.metadata.create_all()` 自動建表，無需手動 migration。

## REST API

| Method | Path | Body / Query | Response |
|---|---|---|---|
| `GET` | `/api/conversations` | — | `[{id, title, folders, updated_at}, ...]` 依 updated_at desc |
| `POST` | `/api/conversations` | `{folders: [...]}` | `{id, title: null, folders, ...}` 建立空對話 |
| `GET` | `/api/conversations/{id}` | — | `{id, title, folders: string[], messages: [{role: "user"\|"assistant", content: string, sources: string[]}]}`（user 訊息的 sources 為空陣列） |
| `POST` | `/api/conversations/{id}/messages` | `{user_msg: string, assistant_msg: string, sources: string[]}` | `{ok: true, title?: string}` 一次寫一輪；首輪會回傳新產生的標題 |
| `PATCH` | `/api/conversations/{id}` | `{title: "..."}` | `{ok: true}` 改名 |
| `DELETE` | `/api/conversations/{id}` | — | `{ok: true}` |

所有 endpoint 都掛 `Depends(get_current_user)`。每個查詢都加 `Conversation.user_id == current_user.id`，找不到則回 404（避免洩漏其他使用者的 id 範圍）。

## 標題生成（`llm.py`）

新增 `generate_title(question: str, answer: str) -> str`：
- Prompt：「以下是一段問答，請用繁體中文 6–10 字產生一個簡短標題，不要加標點符號或引號」
- 用既有的 `gpt-4o-mini` LLM singleton（不另開 instance）
- 例外處理：任何錯誤（rate limit、auth、network）都 fallback 回傳 `question[:20]`
- 在 `POST /messages` handler 內部呼叫，僅當 `conversation.title is None` 時觸發，把結果一起寫進同一個 transaction

## 訊息寫入時機

- **User 送出 → streaming 完成才寫**（一次寫一輪，user_msg + assistant_msg 同一次 transaction）
- 不在 user 送出時就先寫 user_msg，避免 streaming 失敗時留下孤兒訊息
- streaming 失敗時，error 內容也會被當成 assistant_msg 寫入，使用者叫回時看得到當時發生了什麼

## 前端 UI 細節

### Sidebar Tab 切換

`BookshelfPanel.jsx` 頂端（user header 下方）加一條 tab：「📚 書架 / 💬 對話」。視覺風格沿用既有 header 的「對話/搜尋」mode toggle。

- Tab 狀態 `sidebarTab: "library" | "conversations"` 存於 `BookshelfPanel` 內部 state
- 切換 tab 不影響主聊天區，純 sidebar 內視圖切換

### `ConversationList` 元件結構

- 頂端：「+ 新對話」按鈕
- 每筆對話：
  - 主行：標題（單行 ellipsis）+ 右側 `⋯` icon button（hover 顯示）
  - 副行：相對時間（剛剛 / N 分鐘前 / 今天 HH:MM / 昨天 / MM/DD）
  - 點主體 → 叫回對話
  - `⋯` 下拉選單：`改名` / `刪除`
    - 改名 → 進入 inline edit（沿用既有 `InlineInput` 元件）
    - 刪除 → 開 `ConfirmDialog`：「確定刪除「標題」？此動作無法復原。」
- 目前選取的對話視覺強調：高亮背景 + 左側 accent bar

### `App.jsx` 整合

新增狀態：

```js
const [currentConvId, setCurrentConvId] = useState(null);
const [conversations, setConversations] = useState([]);
```

修改 `handleSend`：
1. 若 `currentConvId === null` → `POST /api/conversations` 拿 id 並 `setCurrentConvId`
2. 照舊 `POST /api/query/stream` 走 RAG
3. streaming 結束 → `POST /api/conversations/{id}/messages`（背景，不阻塞 UI）
4. 該回應若帶 `title` → 更新 `conversations` state 中對應項目的標題

新增 `handleNewChat`：

```js
setMessages([]); setCurrentConvId(null);
// 不預先建立空對話，等使用者真的送第一則才建（避免空對話污染列表）
```

新增 `handleRecall(convId)`：
1. `GET /api/conversations/{convId}` 拿訊息 + folders
2. `setMessages(data.messages)` / `setCurrentConvId(convId)`
3. 資料夾還原容錯：`setSelectedFolders(data.folders.filter(f => f in folderMap || sharedFolders.includes(f)))`
4. 若目前在搜尋模式 → 切回 `mode = "chat"`

## 邊界情況處理

| 情況 | 行為 |
|---|---|
| Streaming 進行中點對話列表 | 列表項目 disabled + 游標 not-allowed，title 提示「等待回應結束」 |
| Streaming 進行中點「+ 新對話」 | 同上 disabled |
| 叫回的對話資料夾全被刪 | `selectedFolders = []`（等同搜尋全部），不報錯 |
| 叫回的對話 source 檔案已被刪 | 訊息中 source badge 照常顯示（純文字，不會壞掉），點擊不做事 |
| 刪除目前正在看的對話 | 刪除後等同按下「+ 新對話」（清空訊息 + `currentConvId = null`） |
| 對話列表為空 | 顯示 empty state：「還沒有對話紀錄，開始問第一個問題吧」 |
| `POST /messages` 失敗 | 控制台 warn，不打擾使用者（畫面上對話還在，下次重整才會發現沒存到 — 可接受的 trade-off） |
| 標題生成失敗 | 自動 fallback 為 `question[:20]`，使用者無感 |

## 不在範圍內（YAGNI）

- 對話搜尋 / 篩選
- 對話分組或 pinning
- 對話匯出（JSON / Markdown）
- 對話分享給其他使用者
- 訊息層級的編輯 / 重新生成

這些可在 v1 上線後依使用情況決定是否補做。
