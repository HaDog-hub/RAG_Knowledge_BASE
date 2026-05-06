import { useState, useEffect } from "react";

const API = "";

export default function SummaryDialog({ open, filename, authFetch, onClose }) {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cached, setCached] = useState(false);
  const [createdAt, setCreatedAt] = useState(null);

  useEffect(() => {
    if (open && filename) fetchSummary(false);
    if (!open) { setSummary(""); setError(""); }
  }, [open, filename]);

  const fetchSummary = async (force) => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(
        `${API}/api/documents/${encodeURIComponent(filename)}/summarize?force=${force}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) { setError(data.detail ?? "摘要生成失敗"); return; }
      setSummary(data.summary);
      setCached(data.cached);
      setCreatedAt(data.created_at ? new Date(data.created_at) : null);
    } catch {
      setError("無法連線到伺服器");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="dialog-overlay" onClick={onClose} />
      <div className="dialog-panel dialog-panel-accent w-full max-w-xl flex flex-col max-h-[80vh]">

        <div className="flex items-center gap-3 px-5 py-4 border-b border-1 shrink-0" style={{ borderColor: "var(--border)" }}>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-base font-semibold text-1 tracking-tight">文件摘要</p>
            <p className="font-mono text-[11px] text-3 truncate mt-0.5">{filename}</p>
          </div>
          <button onClick={onClose} className="btn-icon shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <svg className="w-6 h-6 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="label-mono">AI ANALYSING · 正在分析文件</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2 rounded-lg pill-danger px-3 py-2.5 text-sm" style={{ fontSize: "0.875rem", fontFamily: "inherit" }}>
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {!loading && summary && (
            <div className="space-y-3">
              {cached && createdAt && (
                <div className="flex items-center gap-1.5 label-mono">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  CACHED · {createdAt.toLocaleDateString("zh-TW", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
              <div className="text-sm text-1 leading-relaxed whitespace-pre-wrap">
                {summary}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-1 shrink-0" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => fetchSummary(true)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-2 hover:text-1 disabled:opacity-40 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            重新生成
          </button>
          <button onClick={onClose} className="btn btn-soft px-4 py-1.5 text-sm">關閉</button>
        </div>
      </div>
    </div>
  );
}
