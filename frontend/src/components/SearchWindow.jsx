import { useState, useRef } from "react";

const API = "";

function RelevanceBadge({ rank, total }) {
  const pct = total <= 1 ? 1 : 1 - (rank / (total - 1));
  if (pct >= 0.6) return <span className="pill pill-success">高</span>;
  if (pct >= 0.3) return <span className="pill pill-accent">中</span>;
  return <span className="pill">低</span>;
}

function FileIcon({ name = "" }) {
  const isPdf = name.toLowerCase().endsWith(".pdf");
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none">
      <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6Z" fill={isPdf ? "#D97564" : "#6B8AB5"} opacity="0.85" />
      <path d="M14 2v6h6" fill="none" stroke={isPdf ? "#A03A2C" : "#3D5C8A"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SearchWindow({ authFetch, selectedFolders, onAskAI }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef(null);

  const handleSearch = async (q = query) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setSearched(false);
    try {
      const res = await authFetch(`${API}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, k: 12, folders: selectedFolders }),
      });
      if (!res.ok) { setResults([]); return; }
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 px-6 py-4 bg-bg border-b border-1">
        <div
          className={`flex items-center gap-3 card rounded-xl px-4 py-2.5 shadow-soft transition-all ${
            loading ? "opacity-70" : "focus-within:shadow-pop focus-within:border-accent"
          }`}
        >
          <svg className="w-4 h-4 text-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="輸入關鍵字或語句，直接找到相關段落…"
            className="flex-1 bg-transparent text-sm text-1 placeholder:text-3 focus:outline-none"
            style={{ color: "var(--text-1)" }}
            disabled={loading}
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setResults([]); setSearched(false); inputRef.current?.focus(); }}
              className="btn-icon shrink-0 w-6 h-6"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <button
            onClick={() => handleSearch()}
            disabled={!query.trim() || loading}
            className="btn btn-primary shrink-0 px-3 py-1 text-xs"
          >
            搜尋
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-3">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">搜尋中…</span>
          </div>
        )}

        {!loading && !searched && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 select-none">
            <svg className="w-12 h-12 text-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <p className="font-display text-base text-1">不問 AI，直接找段落</p>
            <p className="label-mono">SEMANTIC SEARCH · NO LLM</p>
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-20 select-none">
            <p className="font-display text-base text-1">找不到相關段落</p>
            <p className="text-xs text-3">試試換個關鍵字，或調整搜尋範圍</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <p className="label-mono">RESULTS · 找到 {results.length} 個段落</p>
              <div className="flex-1 editorial-rule" />
            </div>
            {results.map((r, i) => (
              <div key={i} className="group card p-4 flex flex-col gap-2.5 transition-all hover:shadow-soft hover:border-accent">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 pill max-w-[200px]">
                    <FileIcon name={r.source} />
                    <span className="truncate">{r.source}</span>
                  </div>
                  {r.folder && <span className="pill max-w-[120px] truncate">{r.folder}</span>}
                  <RelevanceBadge rank={i} total={results.length} />
                </div>

                <p className="text-sm text-1 leading-relaxed line-clamp-6">{r.content}</p>

                <div className="flex items-center justify-end pt-1">
                  <button
                    onClick={() => onAskAI(query)}
                    className="flex items-center gap-1.5 text-xs text-accent hover:underline font-medium transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                    </svg>
                    問 AI
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
