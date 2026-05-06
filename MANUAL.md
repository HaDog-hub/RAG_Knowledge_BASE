# RAG Knowledge Base — 使用手冊

## 目錄

1. [快速啟動](#快速啟動)
2. [環境變數說明](#環境變數說明)
3. [API 端點](#api-端點)
4. [運行邏輯](#運行邏輯)
5. [參數調校指南](#參數調校指南)

---

## 快速啟動

```bash
cd backend

# 1. 複製環境變數範本並填入 API Key
cp .env.example .env

# 2. 安裝依賴
pip install -r requirements.txt

# 3. 啟動伺服器
uvicorn app.main:app --reload --port 8000
```

伺服器啟動後：
- API 文件（互動式）：http://localhost:8000/docs
- 健康檢查：http://localhost:8000/health

---

## 環境變數說明

設定檔位於 `backend/.env`，所有參數均有預設值，僅 `OPENAI_API_KEY` 為必填。

### 必填

| 變數 | 說明 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API 金鑰，格式為 `sk-...`，從 platform.openai.com 取得 |

### OpenAI 模型

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `EMBEDDING_MODEL` | `text-embedding-3-small` | 將文字轉成向量的模型。`-small` 便宜且速度快，對大多數用途足夠 |
| `LLM_MODEL` | `gpt-4o-mini` | 生成答案的語言模型。可改為 `gpt-4o` 以提升回答品質（費用較高） |

### ChromaDB 向量資料庫

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `CHROMA_PERSIST_DIR` | `./chroma_db` | 向量資料庫儲存在磁碟的路徑。程式停止後資料仍保留，下次啟動自動載入 |
| `COLLECTION_NAME` | `knowledge_base` | 資料庫內的集合名稱，類似資料庫的表名。多個專案可用不同名稱隔離 |

### 文件分塊

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `CHUNK_SIZE` | `1000` | 每個分塊的最大字元數。影響檢索的粒度，見[參數調校指南](#參數調校指南) |
| `CHUNK_OVERLAP` | `200` | 相鄰分塊重疊的字元數。防止重要內容剛好被切斷在兩個分塊之間 |

### 跨來源設定

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `CORS_ORIGINS` | `http://localhost:3000` | 允許呼叫 API 的前端網址。正式部署時改為實際網域 |

---

## API 端點

### `GET /health`

確認伺服器是否正常運行。

**回應範例：**
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

---

### `POST /api/documents/upload`

上傳文件，系統自動解析、分塊、向量化後存入資料庫。

**請求格式：** `multipart/form-data`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `file` | File | 支援 `.pdf` 和 `.docx` 格式 |

**回應範例（成功）：**
```json
{
  "filename": "company_policy.pdf",
  "chunks": 42,
  "ids": ["abc123", "def456", "..."]
}
```

| 欄位 | 說明 |
|------|------|
| `filename` | 原始檔名 |
| `chunks` | 文件被切成幾個分塊（數字越大代表文件越長） |
| `ids` | 每個分塊在 ChromaDB 的唯一識別碼 |

**錯誤回應：**

| HTTP 狀態碼 | 原因 |
|-------------|------|
| `400` | 不支援的檔案格式（非 PDF / DOCX） |
| `422` | 檔案內容為空，無法提取文字 |

**curl 範例：**
```bash
curl -X POST http://localhost:8000/api/documents/upload \
  -F "file=@./my_document.pdf"
```

---

### `POST /api/query`

送出問題，系統從知識庫中找出相關段落，交給 LLM 生成答案。

**請求格式：** `application/json`

| 欄位 | 型別 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| `question` | string | 是 | — | 要詢問的問題 |
| `k` | integer | 否 | `4` | 從知識庫中取回幾個最相關的段落作為參考 |

**請求範例：**
```json
{
  "question": "公司的請假規定是什麼？",
  "k": 4
}
```

**回應範例：**
```json
{
  "answer": "根據公司規定，員工每年享有 14 天特休假，需提前 3 天申請...",
  "sources": ["company_policy.pdf", "hr_handbook.docx"]
}
```

| 欄位 | 說明 |
|------|------|
| `answer` | LLM 根據檢索到的段落生成的答案 |
| `sources` | 答案參考了哪些文件（去重後的檔名列表） |

**curl 範例：**
```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{"question": "公司的請假規定是什麼？", "k": 4}'
```

---

## 運行邏輯

### 文件上傳流程

```
使用者上傳檔案
      │
      ▼
  格式檢查（PDF / DOCX）
      │
      ▼
  文字提取
  ├─ PDF  → pypdf 逐頁讀取文字
  └─ DOCX → python-docx 逐段落讀取
      │
      ▼
  分塊（RecursiveCharacterTextSplitter）
  ├─ 優先在段落、句子、空格處切割
  ├─ 每塊最大 CHUNK_SIZE 字元
  └─ 相鄰分塊保留 CHUNK_OVERLAP 字元的重疊
      │
      ▼
  向量化（text-embedding-3-small）
  └─ 每個分塊 → 1536 維浮點數向量
      │
      ▼
  存入 ChromaDB（附帶 source 檔名 metadata）
      │
      ▼
  回傳 chunk 數量與 IDs
```

### 問答查詢流程

```
使用者送出問題
      │
      ▼
  問題向量化（text-embedding-3-small）
  └─ 問題 → 1536 維向量
      │
      ▼
  ChromaDB 相似度搜尋
  └─ 找出距離最近的 k 個分塊（cosine similarity）
      │
      ▼
  組合 Prompt
  ├─ System：限制 LLM 只能根據提供的 context 回答
  ├─ Context：k 個檢索到的段落合併
  └─ Question：使用者的問題
      │
      ▼
  gpt-4o-mini 生成答案
      │
      ▼
  回傳 answer + sources（去重的來源檔名）
```

### Lazy Init 機制

`OpenAIEmbeddings`、`Chroma`、`ChatOpenAI` 三個物件均採用延遲初始化：
- 伺服器啟動時不建立，節省啟動時間
- 第一次收到請求時才初始化，之後重複使用同一個實例
- 好處：`.env` 未設定時，伺服器仍可啟動，`/health` 可正常回應

---

## 參數調校指南

### `k`（查詢時取回的段落數）

| 值 | 適合情境 |
|----|----------|
| `2–3` | 問題答案集中在單一段落，要求回答精準簡短 |
| `4`（預設） | 一般用途，平衡精準度與涵蓋面 |
| `6–8` | 問題答案可能分散在多個章節，需要更多上下文 |

> `k` 越大，Prompt 越長，每次查詢的 OpenAI Token 費用越高。

### `CHUNK_SIZE` vs `CHUNK_OVERLAP`

| 情境 | 建議設定 |
|------|----------|
| 技術文件、條文（答案在特定句子） | `CHUNK_SIZE=500`, `CHUNK_OVERLAP=100` |
| 一般文章、報告（預設） | `CHUNK_SIZE=1000`, `CHUNK_OVERLAP=200` |
| 敘事性長文（答案需要前後文） | `CHUNK_SIZE=1500`, `CHUNK_OVERLAP=300` |

> **注意：** 修改這兩個參數後，舊的向量資料庫與新上傳的分塊策略不一致，建議清空 `chroma_db/` 目錄重新上傳。
