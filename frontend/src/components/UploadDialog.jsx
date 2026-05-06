import { useRef, useState, useEffect } from "react";

const API = "";

const UPLOAD_ERRORS = {
  400: "不支援的檔案格式，請上傳 PDF 或 DOCX。",
  422: "無法從檔案中提取文字，請確認檔案內容不為空。",
};

export default function UploadDialog({ open, folders, pendingFolders, folderSettings = {}, onClose, onRefresh, authFetch }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [targetFolder, setTargetFolder] = useState("");
  const [stagedFiles, setStagedFiles] = useState([]);
  const [fileStatuses, setFileStatuses] = useState([]);

  const allFolders = folders.length > 0 ? folders : ["未分類"];

  useEffect(() => {
    if (open) {
      setTargetFolder((prev) => (allFolders.includes(prev) ? prev : allFolders[0]));
    }
  }, [open, folders]);

  if (!open) return null;

  const anyUploading = fileStatuses.some((f) => f.status === "uploading");

  const updateStatus = (name, patch) =>
    setFileStatuses((prev) => prev.map((f) => (f.name === name ? { ...f, ...patch } : f)));

  const uploadFile = async (file, folder) => {
    const form = new FormData();
    form.append("file", file);
    form.append("folder", folder);
    form.append("is_public", folderSettings[folder] ? "true" : "false");
    try {
      const res = await authFetch(`${API}/api/documents/upload`, { method: "POST", body: form });
      if (!res.ok) {
        const msg = UPLOAD_ERRORS[res.status] ?? `伺服器錯誤（${res.status}），請稍後再試。`;
        updateStatus(file.name, { status: "error", error: msg });
        return;
      }
      const data = await res.json();
      updateStatus(file.name, { status: "success", result: data });
      onRefresh();
    } catch {
      updateStatus(file.name, { status: "error", error: "無法連線到伺服器，請確認 backend 是否運行。" });
    }
  };

  const handleStageFiles = (fileList) => {
    const incoming = Array.from(fileList).filter(
      (f) =>
        f.type === "application/pdf" ||
        f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    if (incoming.length === 0) return;
    setStagedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !existingNames.has(f.name))];
    });
  };

  const handleRemoveStaged = (name) =>
    setStagedFiles((prev) => prev.filter((f) => f.name !== name));

  const handleConfirm = () => {
    if (stagedFiles.length === 0 || anyUploading) return;
    const toUpload = [...stagedFiles];
    setStagedFiles([]);
    setFileStatuses((prev) => [
      ...prev,
      ...toUpload.map((f) => ({ name: f.name, status: "uploading" })),
    ]);
    toUpload.forEach((f) => uploadFile(f, targetFolder));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleStageFiles(e.dataTransfer.files);
  };

  const handleClose = () => {
    setStagedFiles([]);
    setFileStatuses([]);
    setDragging(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="dialog-overlay" onClick={!anyUploading ? handleClose : undefined} />
      <div className="dialog-panel p-6 w-96 mx-4 max-h-[90vh] flex flex-col">
        <h3 className="font-display text-lg font-semibold text-1 mb-1 tracking-tight">上傳文件</h3>
        <p className="label-mono mb-4">UPLOAD · PDF / DOCX</p>

        <div className="flex items-center gap-2 mb-4">
          <span className="label-mono shrink-0">至</span>
          <select
            value={targetFolder}
            onChange={(e) => setTargetFolder(e.target.value)}
            className="input-field flex-1"
          >
            {allFolders.map((f) => (
              <option key={f} value={f}>
                {f}{pendingFolders.includes(f) ? "（新）" : ""}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className="w-full rounded-xl border-2 border-dashed py-7 text-sm transition-all"
          style={dragging
            ? { borderColor: "var(--accent)", background: "var(--accent-subtle)", color: "var(--accent)" }
            : { borderColor: "var(--border-strong)", color: "var(--text-2)" }
          }
        >
          <div className="flex flex-col items-center gap-2 pointer-events-none">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <span className="font-medium">{dragging ? "放開以加入佇列" : "點擊或拖曳檔案"}</span>
            <span className="label-mono">支援多檔同時選取</span>
          </div>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          multiple
          className="hidden"
          onChange={(e) => { handleStageFiles(e.target.files); e.target.value = ""; }}
        />

        {stagedFiles.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 overflow-y-auto max-h-36">
            <p className="label-mono mb-0.5">待上傳 · {stagedFiles.length}</p>
            {stagedFiles.map((f) => (
              <div
                key={f.name}
                className="flex items-center gap-2 rounded-lg border border-1 px-2.5 py-2 text-sm text-1"
                style={{ background: "var(--surface-alt)", borderColor: "var(--border)" }}
              >
                <svg className="w-4 h-4 shrink-0 text-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <span className="truncate flex-1">{f.name}</span>
                <button onClick={() => handleRemoveStaged(f.name)} className="btn-icon btn-icon-danger w-5 h-5">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {fileStatuses.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 overflow-y-auto max-h-44">
            {stagedFiles.length > 0 && <p className="label-mono">RESULT</p>}
            {fileStatuses.map((f) => {
              const palette = f.status === "success"
                ? { bg: "var(--success-bg)", border: "transparent", text: "var(--success)" }
                : f.status === "error"
                ? { bg: "var(--danger-bg)", border: "transparent", text: "var(--danger)" }
                : { bg: "var(--surface-alt)", border: "var(--border)", text: "var(--text-2)" };
              return (
                <div
                  key={f.name}
                  className="flex items-start gap-2.5 rounded-lg border p-2.5 text-sm"
                  style={{ background: palette.bg, borderColor: palette.border, color: palette.text }}
                >
                  {f.status === "uploading" ? (
                    <svg className="w-4 h-4 shrink-0 animate-spin mt-0.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : f.status === "success" ? (
                    <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{f.name}</p>
                    {f.status === "uploading" && <p className="text-xs mt-0.5 opacity-70">上傳中…</p>}
                    {f.status === "success" && <p className="text-xs mt-0.5">加入「{f.result.folder}」・{f.result.chunks} 個區塊</p>}
                    {f.status === "error" && <p className="text-xs mt-0.5">{f.error}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={handleClose} disabled={anyUploading} className="btn btn-ghost flex-1">關閉</button>
          <button onClick={handleConfirm} disabled={stagedFiles.length === 0 || anyUploading} className="btn btn-primary flex-1">
            確認上傳
          </button>
        </div>
      </div>
    </div>
  );
}
