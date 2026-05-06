import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import ConfirmDialog from "./ConfirmDialog";
import ConversationList from "./ConversationList";
import NewFolderDialog from "./NewFolderDialog";
import SummaryDialog from "./SummaryDialog";
import UploadDialog from "./UploadDialog";
import ShareFolderDialog from "./ShareFolderDialog";

const API = "";

// ── icons ────────────────────────────────────────────────────────────────────

function FolderIcon({ color = "var(--accent)", open = false }) {
  return open ? (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none">
      <path d="M2 9a2 2 0 0 1 2-2h4l2-2h8a2 2 0 0 1 2 2v1H2V9Z" fill={color} opacity=".75" />
      <path d="M2 10h20l-1.6 8A2 2 0 0 1 18.42 20H5.58A2 2 0 0 1 3.6 18L2 10Z" fill={color} />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none">
      <path d="M2 8a2 2 0 0 1 2-2h4.17a2 2 0 0 1 1.42.59L11 8H2Z" fill={color} opacity=".75" />
      <rect x="2" y="8" width="20" height="12" rx="2" fill={color} />
    </svg>
  );
}

function FileIcon({ name = "" }) {
  const ext = name.split(".").pop()?.toLowerCase();
  const isPdf = ext === "pdf";
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none">
      <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6Z" fill={isPdf ? "#D97564" : "#6B8AB5"} opacity="0.85" />
      <path d="M14 2v6h6" fill="none" stroke={isPdf ? "#A03A2C" : "#3D5C8A"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <text x="5.5" y="18" fontSize="5.5" fontWeight="700" fill="#FFFFFF" fontFamily="DM Mono, monospace">
        {isPdf ? "PDF" : "DOC"}
      </text>
    </svg>
  );
}

// Editorial folder palette — earthy, paper-ink-spice tones (NOT generic Tailwind)
const FOLDER_COLORS = ["#A86D2C", "#7B6A3E", "#9E5A47", "#5E7D5E", "#7A5C8A", "#3D6B7E"];
function folderColor(index) { return FOLDER_COLORS[index % FOLDER_COLORS.length]; }

// ── inline text input ─────────────────────────────────────────────────────────

function InlineInput({ value, onChange, onCommit, onCancel, className = "" }) {
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); onCommit(); }
        if (e.key === "Escape") onCancel();
      }}
      onBlur={onCancel}
      onClick={(e) => e.stopPropagation()}
      className={`input-field py-0.5 px-1.5 text-sm ${className}`}
    />
  );
}

// ── icon button ───────────────────────────────────────────────────────────────

function IconBtn({ onClick, title, children, danger = false }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className={`btn-icon w-6 h-6 ${danger ? "btn-icon-danger" : ""}`}
    >
      {children}
    </button>
  );
}

// ── FolderMenu ────────────────────────────────────────────────────────────────

function FolderMenu({ anchorEl, isPending, onShare, onRename, onDelete, onClose }) {
  const menuRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    function handleMouseDown(e) {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        anchorEl && !anchorEl.contains(e.target)
      ) {
        onCloseRef.current();
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorEl]);

  if (!anchorEl) return null;
  const rect = anchorEl.getBoundingClientRect();
  const menuWidth = 152;
  const estimatedHeight = isPending ? 52 : 120;
  const openUpward = window.innerHeight - rect.bottom < estimatedHeight;

  const style = {
    position: "fixed",
    right: window.innerWidth - rect.right,
    width: menuWidth,
    zIndex: 9999,
    ...(openUpward
      ? { bottom: window.innerHeight - rect.top + 4 }
      : { top: rect.bottom + 4 }),
  };

  const itemBase = {
    width: "100%", display: "flex", alignItems: "center", gap: "10px",
    padding: "7px 12px", borderRadius: "7px", fontSize: "13px",
    textAlign: "left", background: "transparent", border: "none", cursor: "pointer",
  };

  return createPortal(
    <div
      ref={menuRef}
      style={{
        ...style,
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: "10px",
        padding: "4px",
        boxShadow: "var(--shadow-pop)",
      }}
    >
      <button
        style={{ ...itemBase, color: "var(--text-1)" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        onClick={() => { onCloseRef.current(); onShare(); }}
      >
        <svg style={{ width: 14, height: 14, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
        </svg>
        分享資料夾
      </button>

      {!isPending && (
        <>
          <button
            style={{ ...itemBase, color: "var(--text-1)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            onClick={() => { onCloseRef.current(); onRename(); }}
          >
            <svg style={{ width: 14, height: 14, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
            </svg>
            重新命名
          </button>
          <div style={{ height: "1px", background: "var(--border)", margin: "3px 4px" }} />
          <button
            style={{ ...itemBase, color: "var(--danger)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--danger-bg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            onClick={() => { onCloseRef.current(); onDelete(); }}
          >
            <svg style={{ width: 14, height: 14, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
            刪除資料夾
          </button>
        </>
      )}
    </div>,
    document.body
  );
}

// ── FolderTree ────────────────────────────────────────────────────────────────

function FolderTree({
  allFolders, folderMap, pendingFolders, collapsed, dragFile, dropTarget,
  renamingFolder, renamingFolderValue,
  renamingFile, renamingFileValue,
  onToggle, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
  getFolderIsPublic, onToggleVisibility,
  onSummarizeFile, onDeleteFile, onDeleteFolder,
  onShare,
  menuState, onOpenMenu, onCloseMenu,
  onStartRenameFolder, onChangeRenameFolder, onCommitRenameFolder, onCancelRenameFolder,
  onStartRenameFile, onChangeRenameFile, onCommitRenameFile, onCancelRenameFile,
}) {
  if (allFolders.length === 0) {
    return (
      <div className="text-center mt-6">
        <p className="label-mono mb-1">EMPTY</p>
        <p className="text-xs text-3">尚無資料夾</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {allFolders.map((folder, folderIdx) => {
        const files = folderMap[folder] || [];
        const isPending = pendingFolders.includes(folder);
        const isOpen = !collapsed[folder];
        const isDropTarget = dropTarget === folder;
        const color = folderColor(folderIdx);
        const isRenamingThis = renamingFolder === folder;

        return (
          <div
            key={folder}
            className="rounded-xl border overflow-hidden transition-all"
            style={isDropTarget
              ? { borderColor: color, borderStyle: "dashed", borderWidth: "2px", background: `${color}12`, transform: "scale(1.01)" }
              : { borderColor: "var(--border)", borderWidth: "1px", background: "var(--surface)" }
            }
            onDragOver={(e) => onDragOver(e, folder)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, folder)}
          >
            {/* folder header */}
            <div
              onClick={() => !isRenamingThis && onToggle(folder)}
              className="flex items-center px-3 py-2.5 transition-colors group cursor-pointer"
              style={{ background: "transparent" }}
              onMouseEnter={(e) => { if (!isDropTarget) e.currentTarget.style.background = "var(--surface-alt)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
                <FolderIcon color={color} open={isOpen} />
                {isRenamingThis ? (
                  <InlineInput
                    value={renamingFolderValue}
                    onChange={onChangeRenameFolder}
                    onCommit={onCommitRenameFolder}
                    onCancel={onCancelRenameFolder}
                    className="flex-1 min-w-0"
                  />
                ) : (
                  <span className="font-display text-sm font-semibold text-1 truncate tracking-tight">{folder}</span>
                )}
                {isPending && <span className="label-mono shrink-0 ml-1" style={{ fontSize: "9px" }}>新</span>}
              </div>

              <div className="flex items-center gap-0.5 shrink-0 ml-1.5">
                {files.length > 0 && !isRenamingThis && (
                  <span
                    className="font-mono text-[10px] font-semibold rounded-full px-2 py-0.5 leading-none mr-0.5"
                    style={{ background: `${color}22`, color }}
                  >
                    {files.length}
                  </span>
                )}

                {!isRenamingThis && (
                  <IconBtn
                    onClick={() => onToggleVisibility(folder)}
                    title={getFolderIsPublic(folder) ? "公開 — 點擊改為私人" : "私人 — 點擊改為公開"}
                  >
                    {getFolderIsPublic(folder) ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--success)" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253M3 12c0 .778.099 1.533.284 2.253" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                      </svg>
                    )}
                  </IconBtn>
                )}

                {!isRenamingThis && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); menuState?.folder === folder ? onCloseMenu() : onOpenMenu(folder, e.currentTarget); }}
                      title="更多選項"
                      className="btn-icon w-6 h-6"
                    >
                      <span style={{ fontSize: "15px", fontWeight: 700, lineHeight: 1, letterSpacing: "1px" }}>⋯</span>
                    </button>
                    {menuState?.folder === folder && (
                      <FolderMenu
                        anchorEl={menuState.anchorEl}
                        isPending={isPending}
                        onShare={() => onShare(folder)}
                        onRename={() => onStartRenameFolder(folder)}
                        onDelete={() => onDeleteFolder(folder, files.length)}
                        onClose={onCloseMenu}
                      />
                    )}
                  </>
                )}

                {!isRenamingThis && (
                  <svg
                    className={`w-3.5 h-3.5 text-3 transition-transform ml-0.5 ${collapsed[folder] ? "-rotate-90" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                  </svg>
                )}
              </div>
            </div>

            {/* file list */}
            {isOpen && (
              <ul className="border-t border-1" style={{ borderColor: "var(--border)" }}>
                {files.length === 0 ? (
                  <li className="px-3 py-3 text-sm text-3 italic text-center">拖曳文件至此</li>
                ) : (
                  files.map((filename, i) => {
                    const isRenamingThisFile = renamingFile?.filename === filename && renamingFile?.folder === folder;
                    return (
                      <li
                        key={i}
                        draggable={!isRenamingThisFile}
                        onDragStart={!isRenamingThisFile ? (e) => onDragStart(e, filename, folder) : undefined}
                        onDragEnd={onDragEnd}
                        className={`group flex items-center gap-2 px-3 py-2.5 min-w-0 transition-opacity border-t border-1 first:border-t-0 ${
                          !isRenamingThisFile ? "cursor-grab active:cursor-grabbing" : ""
                        } ${dragFile?.filename === filename ? "opacity-40" : ""}`}
                        style={{ background: "var(--surface-alt)", borderColor: "var(--border)" }}
                      >
                        <FileIcon name={filename} />
                        {isRenamingThisFile ? (
                          <InlineInput
                            value={renamingFileValue}
                            onChange={onChangeRenameFile}
                            onCommit={onCommitRenameFile}
                            onCancel={onCancelRenameFile}
                            className="flex-1 min-w-0"
                          />
                        ) : (
                          <span className="truncate flex-1 text-sm text-1">{filename}</span>
                        )}
                        {!isRenamingThisFile && (
                          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100">
                            <IconBtn onClick={() => onSummarizeFile(filename)} title="AI 摘要">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                              </svg>
                            </IconBtn>
                            <IconBtn onClick={() => onStartRenameFile(filename, folder)} title="重新命名">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                              </svg>
                            </IconBtn>
                            <IconBtn onClick={() => onDeleteFile(filename)} title="刪除" danger>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                              </svg>
                            </IconBtn>
                          </div>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── BookshelfSidebar ──────────────────────────────────────────────────────────

export default function BookshelfSidebar({
  folderMap, folderSettings = {}, sharedFolders, onRefresh, authFetch, username, onLogout,
  conversations = [], currentConvId = null,
  onNewChat = () => {}, onSelectConv = () => {}, onRenameConv = () => {}, onDeleteConv = () => {},
  streaming = false,
}) {
  const [sidebarTab, setSidebarTab] = useState("library");
  const [pendingFolders, setPendingFolders] = useState([]);
  const [pendingFolderSettings, setPendingFolderSettings] = useState({});
  const [collapsed, setCollapsed] = useState({});
  const [pendingDeleteFile, setPendingDeleteFile] = useState(null);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState(null);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renamingFolderValue, setRenamingFolderValue] = useState("");
  const [renamingFile, setRenamingFile] = useState(null);
  const [renamingFileValue, setRenamingFileValue] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [summaryTarget, setSummaryTarget] = useState(null);
  const [dragFile, setDragFile] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [menuState, setMenuState] = useState(null); // { folder: string, anchorEl: Element } | null

  const folderNames = Object.keys(folderMap);
  const allFolders = [...new Set([...folderNames, ...pendingFolders])];
  const totalDocs = Object.values(folderMap).reduce((acc, f) => acc + f.length, 0);
  const sharedTotal = (sharedFolders ?? []).reduce((acc, sf) => acc + sf.files.length, 0);

  useEffect(() => {
    setPendingFolders((prev) => prev.filter((f) => !folderNames.includes(f)));
  }, [folderNames]);

  // ── file actions ──────────────────────────────────────────────────────────

  const handleDeleteFileConfirmed = async () => {
    const filename = pendingDeleteFile;
    setPendingDeleteFile(null);
    try {
      const res = await authFetch(`${API}/api/documents/${encodeURIComponent(filename)}`, { method: "DELETE" });
      if (!res.ok) return;
      onRefresh();
    } catch { /* silent fail */ }
  };

  const handleStartRenameFile = (filename, folder) => {
    setRenamingFile({ filename, folder });
    setRenamingFileValue(filename);
  };

  const handleCommitRenameFile = async () => {
    const newName = renamingFileValue.trim();
    const { filename } = renamingFile;
    setRenamingFile(null);
    if (!newName || newName === filename) return;
    try {
      const res = await authFetch(`${API}/api/documents/${encodeURIComponent(filename)}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: newName }),
      });
      if (!res.ok) return;
      onRefresh();
    } catch { /* silent fail */ }
  };

  // ── folder actions ────────────────────────────────────────────────────────

  const handleDeleteFolderConfirmed = async () => {
    setMenuState(null);
    const folderName = pendingDeleteFolder.name;
    setPendingDeleteFolder(null);
    try {
      const res = await authFetch(`${API}/api/folders/${encodeURIComponent(folderName)}`, { method: "DELETE" });
      if (!res.ok) return;
      onRefresh();
    } catch { /* silent fail */ }
  };

  const handleStartRenameFolder = (folder) => {
    setRenamingFolder(folder);
    setRenamingFolderValue(folder);
    setCollapsed((prev) => ({ ...prev, [folder]: false }));
  };

  const handleCommitRenameFolder = async () => {
    setMenuState(null);
    const newName = renamingFolderValue.trim();
    const oldName = renamingFolder;
    setRenamingFolder(null);
    if (!newName || newName === oldName) return;
    try {
      const res = await authFetch(`${API}/api/folders/${encodeURIComponent(oldName)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: newName }),
      });
      if (!res.ok) return;
      onRefresh();
    } catch { /* silent fail */ }
  };

  // ── visibility ────────────────────────────────────────────────────────────

  const getFolderIsPublic = (folder) =>
    pendingFolders.includes(folder)
      ? (pendingFolderSettings[folder] ?? false)
      : (folderSettings[folder] ?? false);

  const handleToggleVisibility = async (folder) => {
    const isPending = pendingFolders.includes(folder);
    const newValue = !getFolderIsPublic(folder);
    if (isPending) {
      setPendingFolderSettings((prev) => ({ ...prev, [folder]: newValue }));
      return;
    }
    try {
      await authFetch(`${API}/api/folders/${encodeURIComponent(folder)}/visibility`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: newValue }),
      });
      onRefresh();
    } catch { /* silent fail */ }
  };

  const allFolderSettings = { ...folderSettings };
  pendingFolders.forEach((f) => { allFolderSettings[f] = pendingFolderSettings[f] ?? false; });

  // ── drag ──────────────────────────────────────────────────────────────────

  const handleFileDragStart = (e, filename, fromFolder) => {
    setDragFile({ filename, fromFolder });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleFolderDragOver = (e, folder) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(folder);
  };

  const handleFolderDrop = async (e, toFolder) => {
    e.preventDefault();
    setDropTarget(null);
    if (!dragFile || dragFile.fromFolder === toFolder) { setDragFile(null); return; }
    const { filename } = dragFile;
    setDragFile(null);
    try {
      const res = await authFetch(`${API}/api/documents/${encodeURIComponent(filename)}/folder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: toFolder }),
      });
      if (!res.ok) return;
      onRefresh();
    } catch { /* silent fail */ }
  };

  return (
    <>
      <ConfirmDialog
        open={!!pendingDeleteFile}
        title="刪除文件"
        message={<>確定要從知識庫中移除 <span className="font-medium text-1 break-all">「{pendingDeleteFile}」</span>？此操作無法復原。</>}
        confirmLabel="確認刪除"
        onConfirm={handleDeleteFileConfirmed}
        onCancel={() => setPendingDeleteFile(null)}
      />

      <ConfirmDialog
        open={!!pendingDeleteFolder}
        title="刪除資料夾"
        message={
          pendingDeleteFolder?.fileCount > 0
            ? <>確定要刪除資料夾 <span className="font-medium text-1">「{pendingDeleteFolder?.name}」</span>？資料夾內的 <span className="font-medium text-danger">{pendingDeleteFolder?.fileCount} 份文件</span>將一併刪除，此操作無法復原。</>
            : <>確定要刪除資料夾 <span className="font-medium text-1">「{pendingDeleteFolder?.name}」</span>？</>
        }
        confirmLabel="確認刪除"
        onConfirm={handleDeleteFolderConfirmed}
        onCancel={() => setPendingDeleteFolder(null)}
      />

      <SummaryDialog
        open={!!summaryTarget}
        filename={summaryTarget}
        authFetch={authFetch}
        onClose={() => setSummaryTarget(null)}
      />

      <NewFolderDialog
        open={showNewFolder}
        existingFolders={allFolders}
        onConfirm={(name, isPublic) => {
          if (!name || allFolders.includes(name)) return;
          setPendingFolders((prev) => [...prev, name]);
          setPendingFolderSettings((prev) => ({ ...prev, [name]: isPublic ?? false }));
        }}
        onClose={() => setShowNewFolder(false)}
      />
      <UploadDialog
        open={showUpload}
        folders={allFolders}
        pendingFolders={pendingFolders}
        folderSettings={allFolderSettings}
        onClose={() => setShowUpload(false)}
        onRefresh={onRefresh}
        authFetch={authFetch}
      />
      <ShareFolderDialog
        open={!!shareTarget}
        folderName={shareTarget}
        authFetch={authFetch}
        onClose={() => setShareTarget(null)}
      />

      <aside
        className="flex flex-col w-72 h-screen overflow-hidden shrink-0 border-r border-1"
        style={{ background: "var(--sidebar)", borderColor: "var(--sidebar-border)" }}
      >

        {/* user header */}
        <div
          className="shrink-0 px-4 py-4 border-b border-1"
          style={{ background: "var(--header)", borderTop: "2px solid var(--accent)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="brand-mark w-6 h-6 rounded-full text-xs">
                {username?.[0]?.toUpperCase() ?? "U"}
              </div>
              <span className="text-sm text-1 font-medium truncate">{username}</span>
            </div>
            <button onClick={onLogout} title="登出" className="btn-icon shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
              </svg>
            </button>
          </div>

          {/* tab switch */}
          <div className="tab-bar w-full mb-3">
            {[["library", "📚 書架"], ["conversations", "💬 對話"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSidebarTab(key)}
                className={`tab-button flex-1 ${sidebarTab === key ? "tab-button-active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>

          {sidebarTab === "library" && (<>
            <div className="flex items-baseline gap-2 mb-2">
              <h2 className="font-display text-base font-semibold text-1 tracking-tight">知識庫</h2>
              <span className="label-mono">LIBRARY</span>
            </div>
            {totalDocs > 0 || sharedTotal > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                <span className="pill">{allFolders.length} 資料夾</span>
                <span className="pill">{totalDocs} 文件</span>
                {sharedTotal > 0 && <span className="pill pill-accent">{sharedTotal} 共享</span>}
              </div>
            ) : (
              <p className="label-mono">尚無文件 · EMPTY</p>
            )}

            <div className="flex flex-col gap-2 mt-3">
              <button
                onClick={onNewChat}
                disabled={streaming}
                title={streaming ? "等待回應結束" : "開新對話"}
                className="btn btn-primary w-full"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                新對話
              </button>
              <button onClick={() => setShowNewFolder(true)} className="btn btn-ghost w-full">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                </svg>
                新增資料夾
              </button>
              <button onClick={() => setShowUpload(true)} className="btn btn-soft w-full">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                上傳文件
              </button>
            </div>
          </>)}
        </div>

        {sidebarTab === "conversations" ? (
          <ConversationList
            conversations={conversations}
            currentConvId={currentConvId}
            onSelect={onSelectConv}
            onRename={onRenameConv}
            onDelete={onDeleteConv}
            disabled={streaming}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
            <FolderTree
              allFolders={allFolders}
              folderMap={folderMap}
              pendingFolders={pendingFolders}
              collapsed={collapsed}
              dragFile={dragFile}
              dropTarget={dropTarget}
              renamingFolder={renamingFolder}
              renamingFolderValue={renamingFolderValue}
              renamingFile={renamingFile}
              renamingFileValue={renamingFileValue}
              onToggle={(folder) => setCollapsed((prev) => ({ ...prev, [folder]: !prev[folder] }))}
              getFolderIsPublic={getFolderIsPublic}
              onToggleVisibility={handleToggleVisibility}
              onDragStart={handleFileDragStart}
              onDragEnd={() => setDragFile(null)}
              onDragOver={handleFolderDragOver}
              onDragLeave={() => setDropTarget(null)}
              onDrop={handleFolderDrop}
              onSummarizeFile={(filename) => setSummaryTarget(filename)}
              onDeleteFile={(filename) => setPendingDeleteFile(filename)}
              onDeleteFolder={(folder, fileCount) => setPendingDeleteFolder({ name: folder, fileCount })}
              onShare={(folder) => setShareTarget(folder)}
              menuState={menuState}
              onOpenMenu={(folder, anchorEl) => setMenuState({ folder, anchorEl })}
              onCloseMenu={() => setMenuState(null)}
              onStartRenameFolder={handleStartRenameFolder}
              onChangeRenameFolder={setRenamingFolderValue}
              onCommitRenameFolder={handleCommitRenameFolder}
              onCancelRenameFolder={() => setRenamingFolder(null)}
              onStartRenameFile={handleStartRenameFile}
              onChangeRenameFile={setRenamingFileValue}
              onCommitRenameFile={handleCommitRenameFile}
              onCancelRenameFile={() => setRenamingFile(null)}
            />

            {(sharedFolders ?? []).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="label-mono">SHARED · 共享給我</span>
                  <div className="flex-1 editorial-rule" />
                </div>
                <div className="flex flex-col gap-2">
                  {(sharedFolders ?? []).map((sf, idx) => {
                    const key = `${sf.owner}/${sf.folder}`;
                    const isOpen = !collapsed[key];
                    const color = folderColor(allFolders.length + idx);
                    return (
                      <div key={key} className="card overflow-hidden">
                        <button
                          onClick={() => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))}
                          className="w-full flex items-center justify-between px-3 py-2.5 transition-colors"
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-alt)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FolderIcon color={color} open={isOpen} />
                            <div className="min-w-0 text-left">
                              <span className="font-display text-sm font-semibold text-1 truncate block">{sf.folder}</span>
                              <span className="text-xs text-3 truncate block">來自 {sf.owner}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {sf.files.length > 0 && (
                              <span
                                className="font-mono text-[10px] font-semibold rounded-full px-2 py-0.5 leading-none"
                                style={{ background: `${color}22`, color }}
                              >
                                {sf.files.length}
                              </span>
                            )}
                            <svg className={`w-3.5 h-3.5 text-3 transition-transform ${collapsed[key] ? "-rotate-90" : ""}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                            </svg>
                          </div>
                        </button>
                        {isOpen && (
                          <ul className="border-t border-1" style={{ borderColor: "var(--border)" }}>
                            {sf.files.length === 0 ? (
                              <li className="px-3 py-3 text-sm text-3 italic text-center">（空）</li>
                            ) : sf.files.map((filename, i) => (
                              <li
                                key={i}
                                className="flex items-center gap-2 px-3 py-2.5 min-w-0 border-t border-1 first:border-t-0"
                                style={{ background: "var(--surface-alt)", borderColor: "var(--border)" }}
                              >
                                <FileIcon name={filename} />
                                <span className="truncate flex-1 text-sm text-1">{filename}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
