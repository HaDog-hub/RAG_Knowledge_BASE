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
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {conversations.length === 0 ? (
          <div className="text-center mt-12 px-4">
            <p className="label-mono mb-2">EMPTY</p>
            <p className="text-xs text-3 leading-relaxed">
              還沒有對話紀錄<br />
              <span className="text-2">開始問第一個問題吧</span>
            </p>
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
                }`}
                style={{
                  background: isActive ? "var(--accent-subtle)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                }}
                onMouseEnter={(e) => { if (!isActive && !disabled) e.currentTarget.style.background = "var(--surface-alt)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
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
                    className="input-field py-1 text-sm"
                  />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-1 truncate min-w-0 flex-1">
                        {c.title ?? "未命名對話"}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === c.id ? null : c.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity btn-icon w-5 h-5"
                        title="更多"
                      >
                        ⋯
                      </button>
                    </div>
                    <div className="label-mono mt-0.5" style={{ fontSize: "10px", letterSpacing: "0.12em" }}>
                      {formatRelativeTime(c.updated_at)}
                    </div>
                    {menuOpenId === c.id && (
                      <div
                        className="absolute right-2 top-9 z-10 card shadow-pop py-1 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => startRename(c)}
                          className="block w-full text-left px-3 py-1.5 text-2 hover:bg-surface-alt"
                        >
                          改名
                        </button>
                        <button
                          onClick={() => { onDelete(c); setMenuOpenId(null); }}
                          className="block w-full text-left px-3 py-1.5 text-danger hover:bg-surface-alt"
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
