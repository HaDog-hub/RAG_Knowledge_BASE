# RAG Knowledge Base — TODO

## 已完成

- [x] `backend/` 目錄初始化
- [x] `backend/requirements.txt`
- [x] `backend/.env.example`
- [x] `backend/app/config.py` — pydantic-settings singleton
- [x] `backend/app/main.py` — FastAPI app + CORS middleware + `/health` + router 註冊
- [x] `backend/app/services/__init__.py`
- [x] `backend/app/routers/__init__.py`
- [x] `app/services/embeddings.py` — OpenAIEmbeddings lazy singleton
- [x] `app/services/vector_store.py` — ChromaDB client，add / similarity_search
- [x] `app/services/llm.py` — LangChain RAG chain（prompt → gpt-4o-mini）
- [x] `app/routers/documents.py` — `POST /api/documents/upload`
- [x] `app/routers/query.py` — `POST /api/query`
- [x] `CLAUDE.md` — 專案架構說明
- [x] `MANUAL.md` — 使用手冊（環境變數、API、運行邏輯、參數調校）
- [x] 手動 end-to-end 測試（上傳文件 → 查詢）
- [x] Frontend 初版（Vite + React + Tailwind CSS）
  - 聊天介面（問答 + 來源 badge）
  - 知識庫側邊面板（PDF / DOCX 上傳）
- [x] `GET /api/documents` — 列出已上傳的文件（書架清單）
- [x] `DELETE /api/documents/{filename}` — 刪除文件
- [x] 對話記憶（chat_history 帶入每次查詢）
- [x] 錯誤訊息優化（區分 400 / 422 / 500 / 連線失敗）
- [x] 支援拖曳上傳檔案

---

## 待完成

### 資料夾分類系統（新功能）

**Backend**
- [x] ChromaDB metadata 加入 `folder` 欄位（上傳時帶入）
- [x] `POST /api/documents/upload` 接受 `folder` 參數
- [x] `GET /api/documents` 回傳資料夾結構 `{folders: {folder: [filename]}}`
- [x] `POST /api/query` 接受 `folders` 參數（空陣列 = 搜尋全部）
- [x] `similarity_search` 支援 `filter={"folder": {"$in": folders}}` 篩選

**Frontend**
- [x] 書架面板改為資料夾視圖（可展開 / 收合，顯示各資料夾內的文件）
- [x] 新增資料夾（輸入名稱建立）
- [x] 上傳時選擇目標資料夾
- [x] 聊天介面加入資料夾多選篩選器（FolderSelector，header 下方 pill 切換）
- [x] 拖曳移動文件至不同資料夾（`PATCH /api/documents/{filename}/folder`）
- [x] 刪除前確認 dialog（ConfirmDialog）
- [x] PDF 解析改用 pdfplumber（支援複雜版面 + 表格），pypdf 為 fallback
- [x] DOCX 解析補齊表格、頁首頁尾、文字方塊、註腳
- [x] 新增資料夾 / 上傳文件改為 modal dialog（NewFolderDialog / UploadDialog）
- [x] 上傳支援多檔案、暫存後確認才送出
- [x] 資料夾樹抽成獨立元件（FolderTree），側邊欄可獨立捲動

### 使用者帳號系統

**Backend**
- [x] 新增依賴：`sqlalchemy`, `passlib[bcrypt]`, `python-jose[cryptography]`
- [x] `app/database.py` — SQLite + SQLAlchemy engine、session 管理
- [x] `app/models/user.py` — User ORM model（id, username, hashed_password, created_at）
- [x] `app/services/auth.py` — 密碼 hash/verify、JWT 產生/解析、`get_current_user` dependency
- [x] `app/routers/auth.py` — `POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/me`
- [x] `documents.py` / `query.py` 所有 endpoints 加上 `get_current_user` dependency
- [x] `vector_store.py` 所有操作加入 `user_id` 參數，ChromaDB where filter 加上 `user_id` 篩選
- [x] `POST /api/documents/upload` metadata 寫入 `user_id`

**Frontend**
- [x] `AuthPage.jsx` — 登入 / 註冊切換表單
- [x] `App.jsx` 加入 auth 狀態（token + user），未登入顯示 AuthPage
- [x] Token 存 localStorage，頁面重整後自動還原登入
- [x] 所有 fetch 呼叫帶上 `Authorization: Bearer <token>` header（透過 `authFetch` wrapper）
- [x] 偵測 401 回應 → 自動清除 token 並跳回登入頁
- [x] `BookshelfPanel.jsx` header 加入用戶名顯示 + 登出按鈕

### 深色 / 亮色模式
- [x] `tailwind.config.js` 加入 `darkMode: 'class'`
- [x] App.jsx 管理 dark mode 狀態，toggle 按鈕於 header 右側，偏好存 localStorage
- [x] 所有元件加上 `dark:` 變體（App、AuthPage、BookshelfPanel、ChatWindow、ChatInput、FolderSelector、ConfirmDialog、NewFolderDialog、UploadDialog、ShareFolderDialog）

### 使用者 Email
- [x] User model 加入 `email` 欄位（nullable，向後相容）
- [x] `database.py` 加入 ALTER TABLE migration（自動補欄位）
- [x] 註冊 endpoint 驗證並儲存 email，同 email 不重複
- [x] AuthPage 註冊表單加入 Email 欄位

### 資料夾分享（私人模式）
- [x] `models/folder_share.py` — FolderShare ORM model（owner_id, folder_name, grantee_id）
- [x] `routers/folders.py` — `POST/DELETE/GET /api/folders/{folder}/shares`、`GET /api/folders/shared-with-me`
- [x] `vector_store.similarity_search` 支援 `shared_accesses` 參數（`$or` filter）
- [x] `GET /api/documents` 回傳 `shared` 欄位（共享給我的資料夾）
- [x] `POST /api/query` 自動將所有共享資料夾納入搜尋
- [x] `ShareFolderDialog.jsx` — 管理分享名單（新增 / 移除 email）
- [x] BookshelfPanel 各資料夾顯示分享按鈕，sidebar 底部顯示「共享給我」區塊

### AI API 強化
- [x] `llm.py` chat history 限制最多 20 則（防 token overflow）
- [x] `llm.py` 加入 try/except，將 RateLimitError / AuthenticationError 轉為 503 + 可讀訊息
- [x] `query.py` 過濾空字串 sources，LLM 錯誤以 HTTP 503 回傳
- [x] `query.py` 錯誤訊息傳回前端，前端直接顯示於對話視窗

### 串流回應（Streaming）
- [x] **Backend** `llm.py` 加入 `stream_answer` async generator（`astream`）+ `_build_messages` 共用
- [x] **Backend** `query.py` 新增 `POST /api/query/stream`（SSE `text/event-stream`，JSON 編碼 token/sources/done/error）
- [x] **Frontend** `handleSend` 改用 `ReadableStream` 逐字 append，`loading`（等待回應）與 `streaming`（讀取流）分開管理
- [x] 串流游標動畫（`cursor-blink`），完成後自動移除
- [x] 錯誤處理：串流中途失敗顯示 error 訊息，finally 清除所有殘留 streaming 旗標

### 一鍵摘要文件
- [x] **Backend** `models/document_summary.py` — `DocumentSummary` ORM model（user_id / filename / summary / created_at，unique 約束）
- [x] **Backend** `services/llm.py` 加入 `generate_summary(filename, chunks)` + `SUMMARIZE_PROMPT`，內容截斷 20,000 chars
- [x] **Backend** `services/vector_store.py` 加入 `get_document_chunks(filename, user_id)` — 取回所有 chunk 文字
- [x] **Backend** `POST /api/documents/{filename}/summarize?force=false` — 有快取直接回傳，`force=true` 強制重算，結果存 SQLite
- [x] **Frontend** `SummaryDialog.jsx` — 開啟自動生成，顯示快取時間、重新生成按鈕、spinner、錯誤提示
- [x] **Frontend** BookshelfPanel 每個檔案列加 ✦ 摘要按鈕（hover 顯示，sparkle icon）

### 搜尋模式
- [x] **Backend** `services/vector_store.py` 加入 `search_with_scores` — `similarity_search_with_score` + filter 邏輯
- [x] **Backend** `routers/search.py` — `POST /api/search`（純 ChromaDB，不過 LLM，回傳 source / folder / content / score）
- [x] **Frontend** `SearchWindow.jsx` — 搜尋輸入框、結果卡片（高中低相關性 badge、來源、資料夾、段落原文）、「問 AI」一鍵帶回對話模式
- [x] **Frontend** Header 加入對話 / 搜尋模式切換 tab，`mode` 狀態管理於 App.jsx
- [x] 「問 AI」觸發 `onAskAI(query)` → `setMode("chat")` + `handleSend(query)` 無縫切換

### 對話紀錄
- [ ] **Backend** `models/conversation.py` — Conversation / Message ORM model
- [ ] **Backend** `routers/conversations.py` — CRUD API（列表、建立、讀取、刪除）
- [ ] **Frontend** 對話紀錄 UI（TBD — 待設計討論）

### 其他
- [ ] RWD 手機版排版

### 部署
- [ ] Frontend 靜態部署（Cloudflare Pages / GitHub Pages）
- [ ] Backend 部署（Railway / Render）
