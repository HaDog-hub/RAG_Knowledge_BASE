import { useState } from "react";

export default function NewFolderDialog({ open, existingFolders, onConfirm, onClose }) {
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  if (!open) return null;

  const trimmed = name.trim();
  const isEmpty = !trimmed;
  const isDuplicate = existingFolders.includes(trimmed);

  const handleConfirm = () => {
    if (isEmpty || isDuplicate) return;
    onConfirm(trimmed, isPublic);
    setName("");
    setIsPublic(false);
    onClose();
  };

  const handleCancel = () => {
    setName("");
    setIsPublic(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="dialog-overlay" onClick={handleCancel} />
      <div className="dialog-panel p-6 w-80 mx-4">
        <h3 className="font-display text-lg font-semibold text-1 mb-1 tracking-tight">新增資料夾</h3>
        <p className="label-mono mb-4">NEW FOLDER</p>

        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
            if (e.key === "Escape") handleCancel();
          }}
          placeholder="資料夾名稱…"
          className="input-field"
        />
        {isDuplicate && !isEmpty && (
          <p className="mt-1.5 text-xs text-danger">此資料夾名稱已存在</p>
        )}

        <div className="mt-4">
          <p className="label-mono mb-2">存取權限 · ACCESS</p>
          <div className="tab-bar w-full">
            <button
              type="button"
              onClick={() => setIsPublic(true)}
              className={`tab-button flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm ${isPublic ? "tab-button-active" : ""}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253M3 12c0 .778.099 1.533.284 2.253" />
              </svg>
              公開
            </button>
            <button
              type="button"
              onClick={() => setIsPublic(false)}
              className={`tab-button flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm ${!isPublic ? "tab-button-active" : ""}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              私人
            </button>
          </div>
          <p className="mt-2 text-xs text-3 leading-snug">
            {isPublic ? "所有登入用戶均可搜尋此資料夾的內容" : "僅限您自己及指定共享用戶存取"}
          </p>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={handleCancel} className="btn btn-ghost flex-1">取消</button>
          <button onClick={handleConfirm} disabled={isEmpty || isDuplicate} className="btn btn-primary flex-1">
            新增
          </button>
        </div>
      </div>
    </div>
  );
}
