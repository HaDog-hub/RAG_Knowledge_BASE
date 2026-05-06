import { useState, useEffect } from "react";

const API = "";

export default function ShareFolderDialog({ open, folderName, authFetch, onClose }) {
  const [shares, setShares] = useState([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [error, setError] = useState("");

  const encodedFolder = encodeURIComponent(folderName ?? "");

  useEffect(() => {
    if (!open || !folderName) return;
    setError("");
    setEmail("");
    setLoading(true);
    authFetch(`${API}/api/folders/${encodedFolder}/shares`)
      .then((r) => r.json())
      .then((data) => setShares(Array.isArray(data) ? data : []))
      .catch(() => setError("無法載入分享名單。"))
      .finally(() => setLoading(false));
  }, [open, folderName]);

  if (!open) return null;

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAddLoading(true);
    setError("");
    try {
      const res = await authFetch(`${API}/api/folders/${encodedFolder}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ?? "新增失敗，請稍後再試。");
        return;
      }
      setEmail("");
      const listRes = await authFetch(`${API}/api/folders/${encodedFolder}/shares`);
      setShares(await listRes.json());
    } catch {
      setError("無法連線到伺服器。");
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemove = async (granteeEmail) => {
    try {
      await authFetch(`${API}/api/folders/${encodedFolder}/shares/${encodeURIComponent(granteeEmail)}`, {
        method: "DELETE",
      });
      setShares((prev) => prev.filter((s) => s.email !== granteeEmail));
    } catch {
      setError("移除失敗，請稍後再試。");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="dialog-overlay" onClick={onClose} />
      <div className="dialog-panel p-6 w-96 mx-4 flex flex-col max-h-[90vh]">

        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
          </svg>
          <h3 className="font-display text-lg font-semibold text-1 tracking-tight">分享資料夾</h3>
        </div>
        <p className="text-sm text-2 mb-1 truncate">「{folderName}」</p>
        <p className="label-mono mb-4">SHARE · GRANT ACCESS</p>

        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="輸入對方 Email…"
            className="input-field flex-1 min-w-0"
          />
          <button type="submit" disabled={!email.trim() || addLoading} className="btn btn-primary shrink-0">
            {addLoading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : "新增"}
          </button>
        </form>

        {error && <p className="text-xs text-danger mb-3 -mt-2">{error}</p>}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6">
              <svg className="w-5 h-5 animate-spin text-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : shares.length === 0 ? (
            <div className="text-center py-6">
              <p className="label-mono mb-1">EMPTY</p>
              <p className="text-sm text-3">尚未分享給任何人</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {shares.map((s) => (
                <li
                  key={s.grantee_id}
                  className="flex items-center gap-3 rounded-lg border border-1 px-3 py-2.5"
                  style={{ background: "var(--surface-alt)", borderColor: "var(--border)" }}
                >
                  <div className="brand-mark w-7 h-7 rounded-full text-xs">
                    {s.username?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-1 truncate">{s.username}</p>
                    {s.email && <p className="text-xs text-3 truncate">{s.email}</p>}
                  </div>
                  <button
                    onClick={() => handleRemove(s.email)}
                    className="btn-icon btn-icon-danger shrink-0"
                    title="移除存取權"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button onClick={onClose} className="btn btn-ghost mt-4 w-full">關閉</button>
      </div>
    </div>
  );
}
