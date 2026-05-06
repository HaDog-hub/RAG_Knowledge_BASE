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
