# Docker + Railway 部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 RAG Knowledge Base 打包成單一 Docker 容器，部署到 Railway，提供一個公開網址供展示使用。

**Architecture:** Multi-stage Dockerfile（Node.js build 前端 → Python 執行後端），FastAPI 同時 serve API (`/api/*`) 和 React 靜態檔（`dist/`），資料持久化透過 Railway Volume 掛載於 `/app/data/`。

**Tech Stack:** Docker multi-stage build, FastAPI StaticFiles, Railway, aiofiles

---

## 檔案一覽

| 動作 | 路徑 | 說明 |
|------|------|------|
| 新增 | `Dockerfile` | Multi-stage build：Node 20 build 前端，Python 3.10 執行後端 |
| 新增 | `.dockerignore` | 排除 node_modules、chroma_db、.env 等，加速 build |
| 修改 | `backend/requirements.txt` | 新增 `aiofiles`（StaticFiles 必要依賴） |
| 修改 | `backend/app/main.py` | 在最後加上靜態檔掛載 |
| 修改 | `frontend/src/App.jsx:10` | `const API` 改為相對路徑 |
| 修改 | `frontend/src/components/AuthPage.jsx:3` | 同上 |
| 修改 | `frontend/src/components/BookshelfPanel.jsx:10` | 同上 |
| 修改 | `frontend/src/components/SearchWindow.jsx:3` | 同上 |
| 修改 | `frontend/src/components/ShareFolderDialog.jsx:3` | 同上 |
| 修改 | `frontend/src/components/SummaryDialog.jsx:3` | 同上 |
| 修改 | `frontend/src/components/UploadDialog.jsx:3` | 同上 |

---

## Task 1：新增 `.dockerignore`

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1：建立 `.dockerignore`**

內容：
```
# Node dependencies (rebuilt in Docker)
frontend/node_modules/

# Python caches
**/__pycache__/
**/*.pyc
**/*.pyo
backend/.pytest_cache/

# Local data (should not be in image)
backend/chroma_db/
backend/users.db
backend/.env

# Frontend build output (rebuilt in Docker)
frontend/dist/

# Git & docs
.git/
docs/
*.md
```

- [ ] **Step 2：確認檔案存在**

```bash
ls .dockerignore
```
預期輸出：列出 `.dockerignore`

- [ ] **Step 3：Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore for Docker build"
```

---

## Task 2：新增 `aiofiles` 依賴

**Files:**
- Modify: `backend/requirements.txt`

FastAPI 的 `StaticFiles` 需要 `aiofiles` 才能非同步讀取靜態檔案，目前 `requirements.txt` 沒有此套件。

- [ ] **Step 1：在 `requirements.txt` 最後新增一行**

在 `backend/requirements.txt` 末尾加上：
```
aiofiles==23.2.1
```

完整尾段應為：
```
python-jose[cryptography]==3.3.0
aiofiles==23.2.1
```

- [ ] **Step 2：本機確認可安裝（選做，若本機有 Python 環境）**

```bash
cd backend
pip install aiofiles==23.2.1
```
預期：`Successfully installed aiofiles-23.2.1`

- [ ] **Step 3：Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: add aiofiles for FastAPI StaticFiles"
```

---

## Task 3：前端 API URL 改為相對路徑

**Files:**
- Modify: `frontend/src/App.jsx:10`
- Modify: `frontend/src/components/AuthPage.jsx:3`
- Modify: `frontend/src/components/BookshelfPanel.jsx:10`
- Modify: `frontend/src/components/SearchWindow.jsx:3`
- Modify: `frontend/src/components/ShareFolderDialog.jsx:3`
- Modify: `frontend/src/components/SummaryDialog.jsx:3`
- Modify: `frontend/src/components/UploadDialog.jsx:3`

目前 7 個前端檔案都寫死 `const API = "http://localhost:8000"`。部署到 Railway 後前端和後端同一個 domain，改成空字串讓 fetch 使用相對路徑（`/api/...`）。

- [ ] **Step 1：修改 7 個檔案**

每個檔案找到這一行：
```js
const API = "http://localhost:8000";
```
改為：
```js
const API = "";
```

7 個檔案路徑：
- `frontend/src/App.jsx` 第 10 行
- `frontend/src/components/AuthPage.jsx` 第 3 行
- `frontend/src/components/BookshelfPanel.jsx` 第 10 行
- `frontend/src/components/SearchWindow.jsx` 第 3 行
- `frontend/src/components/ShareFolderDialog.jsx` 第 3 行
- `frontend/src/components/SummaryDialog.jsx` 第 3 行
- `frontend/src/components/UploadDialog.jsx` 第 3 行

- [ ] **Step 2：確認所有 `localhost:8000` 已清除**

```bash
grep -r "localhost:8000" frontend/src/
```
預期輸出：**空白**（沒有任何結果）

- [ ] **Step 3：Commit**

```bash
git add frontend/src/App.jsx \
        frontend/src/components/AuthPage.jsx \
        frontend/src/components/BookshelfPanel.jsx \
        frontend/src/components/SearchWindow.jsx \
        frontend/src/components/ShareFolderDialog.jsx \
        frontend/src/components/SummaryDialog.jsx \
        frontend/src/components/UploadDialog.jsx
git commit -m "feat: use relative API URL for production deployment"
```

---

## Task 4：FastAPI 掛載靜態檔案

**Files:**
- Modify: `backend/app/main.py`

在所有 router include 之後、最後一行前，加上靜態檔掛載。`html=True` 讓 FastAPI 對未知路徑回傳 `index.html`（SPA routing）。

- [ ] **Step 1：修改 `backend/app/main.py`**

在這一行之後（目前最後一行）：
```python
@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.3.0"}
```

加上（**附加在整個檔案的結尾**）：
```python

# ── Static files (production only) ─────────────────────────────────────────
from fastapi.staticfiles import StaticFiles

_dist = os.path.join(os.path.dirname(__file__), "..", "dist")
if os.path.isdir(_dist):
    app.mount("/", StaticFiles(directory=_dist, html=True), name="static")
```

注意：`os` 已在 `main.py` 第 1 行 import，不需重複。

注意：`app.mount("/", ...)` 必須在所有 `app.include_router` 和 `@app.get` 之後，否則會攔截 API 請求。

- [ ] **Step 2：確認語法正確（本機有 Python 環境時）**

```bash
cd backend
python -c "from app.main import app; print('OK')"
```
預期輸出：`OK`（若沒有 `.env` 會有 settings 錯誤，可忽略；只要不是 SyntaxError）

- [ ] **Step 3：Commit**

```bash
git add backend/app/main.py
git commit -m "feat: serve React dist via FastAPI StaticFiles for production"
```

---

## Task 5：新增 `Dockerfile`

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1：建立 `Dockerfile`（放在 repo 根目錄）**

```dockerfile
# ── Stage 1: Build frontend ─────────────────────────────────────────────────
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Run backend ────────────────────────────────────────────────────
FROM python:3.10-slim
WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./

# Copy built frontend
COPY --from=frontend-build /frontend/dist ./dist

EXPOSE 8000

# Use $PORT if Railway provides it, else default to 8000
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

- [ ] **Step 2：Commit**

```bash
git add Dockerfile
git commit -m "feat: add multi-stage Dockerfile for Railway deployment"
```

---

## Task 6：本機測試 Docker Build（需要本機安裝 Docker Desktop）

若本機沒有 Docker Desktop 可跳過此 Task，直接進 Task 7。

**Files:** 無（只是測試）

- [ ] **Step 1：建立測試用 `.env`（放在 repo 根目錄，只用於本機測試）**

```bash
cat > .env.docker.test << 'EOF'
OPENAI_API_KEY=sk-test-dummy
JWT_SECRET_KEY=localtest123localtest123localtest123localtest123
CORS_ORIGINS=http://localhost:8000
EOF
```

- [ ] **Step 2：Build Docker image**

```bash
docker build -t rag-kb:test .
```
預期：最後一行出現 `Successfully built` 或 `naming to docker.io/library/rag-kb:test`，無 ERROR。

- [ ] **Step 3：啟動容器**

```bash
docker run --rm -p 8000:8000 \
  --env-file .env.docker.test \
  rag-kb:test
```

- [ ] **Step 4：驗證靜態檔案（另開 terminal）**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/
```
預期輸出：`200`

- [ ] **Step 5：驗證健康 API**

```bash
curl http://localhost:8000/health
```
預期輸出：`{"status":"ok","version":"0.3.0"}`

- [ ] **Step 6：停止容器，刪除測試 env**

```bash
# Ctrl+C 停止容器，然後：
rm .env.docker.test
```

---

## Task 7：部署到 Railway

**Files:** 無（在 Railway 後台操作）

前置條件：程式碼已 push 到 GitHub，且 Tasks 1–5 的 commits 都已在 main branch 上。

- [ ] **Step 1：Push 到 GitHub**

```bash
git push origin main
```

- [ ] **Step 2：建立 Railway 專案**

1. 前往 [railway.app](https://railway.app) → 登入
2. **New Project** → **Deploy from GitHub Repo**
3. 選擇你的 repo → 點 **Deploy Now**

Railway 會自動偵測到 `Dockerfile` 並開始 build。

- [ ] **Step 3：設定環境變數**

在 Railway 專案頁面 → **Variables** → 新增以下變數：

| 變數名稱 | 值 |
|---------|-----|
| `OPENAI_API_KEY` | `sk-...`（你的 OpenAI key） |
| `JWT_SECRET_KEY` | 執行下列指令取得：`python -c "import secrets; print(secrets.token_hex(32))"` |
| `CHROMA_PERSIST_DIR` | `/app/data/chroma_db` |
| `SQLITE_URL` | `sqlite:////app/data/users.db` |
| `CORS_ORIGINS` | 先跳過，Step 6 取得網址後再填（`allow_credentials=True` 不能使用 `*`） |
| `JWT_ALGORITHM` | `HS256` |
| `JWT_EXPIRE_DAYS` | `7` |

- [ ] **Step 4：新增 Volume（持久磁碟）**

1. Railway 專案頁面 → **Volumes** → **Add Volume**
2. Mount Path 填：`/app/data`
3. 儲存後 Railway 會自動 redeploy

- [ ] **Step 5：確認部署成功**

等待 build 完成，Railway 後台應顯示 **Active**。點擊 **Deployments** → 看最新一筆是否為綠色 ✓。

- [ ] **Step 6：取得網址並更新 CORS_ORIGINS**

1. Railway 頁面 → **Settings** → **Networking** → 找到 `.railway.app` 網址（例如 `https://rag-kb-production.railway.app`）
2. 回到 **Variables**，把 `CORS_ORIGINS` 改為該網址（例如 `https://rag-kb-production.railway.app`）
3. Railway 自動 redeploy

- [ ] **Step 7：最終驗證**

打開 Railway 給的網址：
- 應該看到 RAG 知識庫登入畫面
- 登入後可上傳文件、發問

完成！把網址分享給教授/面試官即可。
