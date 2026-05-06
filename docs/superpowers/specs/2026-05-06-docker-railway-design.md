# Docker + Railway 部署設計

**日期**：2026-05-06  
**目標**：將 RAG Knowledge Base 部署到 Railway，提供一個公開網址供展示使用，API key 僅存於伺服器端不外洩。

---

## 需求摘要

- 展示給教授、面試官等少數人，給他們一個網址即可使用
- API key 由開發者持有，不洩漏給使用者
- 資料（上傳文件、使用者帳號）在重新部署後仍然保留
- 開發者只需 `git push`，Railway 自動部署

---

## 架構：單一容器（方案 A）

FastAPI 同時提供 REST API 與前端靜態檔案，Railway 只需一個服務。

```
Railway Service
└── Docker container
    ├── uvicorn app.main:app (port 8000)
    │   ├── /api/*       → FastAPI 路由
    │   └── /*           → React 靜態檔 (dist/) + SPA fallback
    └── Railway Volume 掛載於 /app/data/
        ├── chroma_db/   → ChromaDB 向量資料
        └── users.db     → SQLite 使用者資料
```

---

## 檔案變更清單

### 新增檔案

| 檔案 | 說明 |
|------|------|
| `Dockerfile` | Multi-stage build：Stage 1 Node.js build 前端，Stage 2 Python 執行後端 |
| `.dockerignore` | 排除 node_modules、chroma_db、__pycache__、.env 等 |

### 修改檔案

| 檔案 | 變更 |
|------|------|
| `frontend/src/App.jsx` | `const API = "http://localhost:8000"` → `const API = ""` |
| `frontend/src/components/BookshelfPanel.jsx` | 同上 |
| `backend/app/main.py` | 加上 `StaticFiles` 掛載 + SPA fallback route |

---

## Dockerfile 設計

```dockerfile
# Stage 1: 建置前端
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: 執行後端
FROM python:3.10-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend-build /frontend/dist ./dist
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## FastAPI 靜態檔案掛載（main.py）

```python
from fastapi.staticfiles import StaticFiles
import os

# 在所有 router 註冊之後，最後一行加上
dist_path = os.path.join(os.path.dirname(__file__), "..", "dist")
if os.path.exists(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")
```

`html=True` 讓 StaticFiles 自動處理 SPA routing：找不到對應檔案時回傳 `index.html`。  
API 路由（`/api/...`）在前面已註冊，優先匹配，不受影響。  
此掛載必須是 `app.mount` 系列中**最後一個**，否則會攔截 API 請求。

---

## 資料持久化

Railway Volume 掛載於 `/app/data/`，透過環境變數指定路徑：

| 環境變數 | 值 |
|---------|-----|
| `CHROMA_PERSIST_DIR` | `/app/data/chroma_db` |
| `SQLITE_URL` | `sqlite:////app/data/users.db` |

---

## Railway 環境變數

在 Railway 後台設定，不進 Dockerfile 或 git：

| 變數 | 說明 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API Key |
| `JWT_SECRET_KEY` | 強隨機字串（`python -c "import secrets; print(secrets.token_hex(32))"` 生成） |
| `CHROMA_PERSIST_DIR` | `/app/data/chroma_db` |
| `SQLITE_URL` | `sqlite:////app/data/users.db` |
| `CORS_ORIGINS` | Railway 提供的 `.railway.app` 網址 |
| `JWT_ALGORITHM` | `HS256` |
| `JWT_EXPIRE_DAYS` | `7` |

---

## 部署步驟

1. 完成程式碼修改並 `git push` 到 GitHub
2. Railway → New Project → Deploy from GitHub Repo
3. 在 Railway 後台設定上述環境變數
4. 新增 Volume，掛載路徑設為 `/app/data`
5. 觸發部署，等待完成
6. 取得 `.railway.app` 網址，更新 `CORS_ORIGINS` 環境變數

---

## 不在此次範圍

- CI/CD pipeline
- 自訂 domain
- 多環境（staging/production）分離
