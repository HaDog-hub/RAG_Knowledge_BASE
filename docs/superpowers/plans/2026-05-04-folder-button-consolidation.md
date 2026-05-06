# Folder Button Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3 hover-only action buttons (Share, Rename, Delete) on each folder row with a single `⋯` overflow menu, freeing space so folder names display without truncation.

**Architecture:** All changes are in one file — `BookshelfPanel.jsx`. A new `FolderMenu` portal component renders the dropdown into `document.body` to avoid `overflow: hidden` clipping from the folder card. A single `menuState` object (`{ folder, anchorEl }`) in `BookshelfSidebar` tracks which menu is open and where to position it; it is drilled into `FolderTree` via props.

**Tech Stack:** React 18, `ReactDOM.createPortal`, existing CSS design tokens (`--surface`, `--border-strong`, `--shadow-pop`, `--danger`, `--danger-bg`, `--surface-hover`), Tailwind utility classes already in use.

---

### Task 1: Add FolderMenu portal component

**Files:**
- Modify: `frontend/src/components/BookshelfPanel.jsx`

- [ ] **Step 1: Extend the React import to include `useRef`**

Change line 1 from:

```js
import { useState, useEffect } from "react";
```

to:

```js
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
```

- [ ] **Step 2: Add the FolderMenu component**

Insert the following after the `IconBtn` component (around line 76, before `// ── FolderTree`):

```jsx
// ── FolderMenu ────────────────────────────────────────────────────────────────

function FolderMenu({ anchorEl, isPending, onShare, onRename, onDelete, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    function handleMouseDown(e) {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        anchorEl && !anchorEl.contains(e.target)
      ) {
        onClose();
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorEl, onClose]);

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
        onClick={() => { onClose(); onShare(); }}
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
            onClick={() => { onClose(); onRename(); }}
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
            onClick={() => { onClose(); onDelete(); }}
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
```

- [ ] **Step 3: Verify no syntax errors**

```bash
cd frontend && npm run build 2>&1 | head -40
```

Expected: build completes (or shows only pre-existing warnings, no new errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/BookshelfPanel.jsx
git commit -m "feat: add FolderMenu portal component"
```

---

### Task 2: Wire menuState and update FolderTree

**Files:**
- Modify: `frontend/src/components/BookshelfPanel.jsx`

- [ ] **Step 1: Add menuState to BookshelfSidebar**

Inside `BookshelfSidebar`, after the existing `useState` declarations (around line 293), add:

```js
const [menuState, setMenuState] = useState(null); // { folder: string, anchorEl: Element } | null
```

- [ ] **Step 2: Add three new props to FolderTree's function signature**

Change:

```js
function FolderTree({
  allFolders, folderMap, pendingFolders, collapsed, dragFile, dropTarget,
  renamingFolder, renamingFolderValue,
  renamingFile, renamingFileValue,
  onToggle, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
  getFolderIsPublic, onToggleVisibility,
  onSummarizeFile, onDeleteFile, onDeleteFolder,
  onShare,
  onStartRenameFolder, onChangeRenameFolder, onCommitRenameFolder, onCancelRenameFolder,
  onStartRenameFile, onChangeRenameFile, onCommitRenameFile, onCancelRenameFile,
}) {
```

to:

```js
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
```

- [ ] **Step 3: Replace the three-button hover span with ⋯ button + FolderMenu**

Find and remove this entire `<span>` block from the folder header section (lines ~173–195):

```jsx
<span className="opacity-0 group-hover:opacity-100 transition-opacity contents">
  <IconBtn onClick={() => onShare(folder)} title="分享資料夾">
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
    </svg>
  </IconBtn>

  {!isPending && !isRenamingThis && (
    <IconBtn onClick={() => onStartRenameFolder(folder)} title="重新命名資料夾">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
      </svg>
    </IconBtn>
  )}

  {!isPending && !isRenamingThis && (
    <IconBtn onClick={() => onDeleteFolder(folder, files.length)} title="刪除資料夾" danger>
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
      </svg>
    </IconBtn>
  )}
</span>
```

Replace it with:

```jsx
{!isRenamingThis && (
  <>
    <button
      onClick={(e) => { e.stopPropagation(); onOpenMenu(folder, e.currentTarget); }}
      title="更多選項"
      className="btn-icon w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
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
```

- [ ] **Step 4: Pass the three new props to FolderTree in BookshelfSidebar**

Find the `<FolderTree` JSX in `BookshelfSidebar` (around line 577) and add:

```jsx
menuState={menuState}
onOpenMenu={(folder, anchorEl) => setMenuState({ folder, anchorEl })}
onCloseMenu={() => setMenuState(null)}
```

alongside the existing props.

- [ ] **Step 5: Verify build is clean**

```bash
cd frontend && npm run build 2>&1 | head -40
```

Expected: build succeeds with no new errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/BookshelfPanel.jsx
git commit -m "feat: wire ⋯ overflow menu into folder rows"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Start dev server**

```bash
cd frontend && npm run dev
```

Open http://localhost:5173.

- [ ] **Step 2: Verify default state (no hover)**

Confirm folder rows show: file count badge + visibility icon (globe if public) + chevron. No ⋯ visible. Long folder names should no longer truncate.

- [ ] **Step 3: Verify hover state**

Hover a folder row. Confirm **only ⋯ appears** (share/rename/delete icons are gone). Visibility toggle and chevron remain.

- [ ] **Step 4: Verify dropdown opens**

Click ⋯ on a normal (non-pending) folder. Confirm dropdown shows:
- 分享資料夾
- 重新命名
- (divider)
- 刪除資料夾 (in red)

- [ ] **Step 5: Verify all three close paths**

- Click anywhere outside the dropdown → closes
- Open again → press Escape → closes
- Open again → click a menu item → executes and closes

- [ ] **Step 6: Verify all three actions execute correctly**

- **分享資料夾** → `ShareFolderDialog` opens with the correct folder name
- **重新命名** → inline rename input appears in the folder row
- **刪除資料夾** → `ConfirmDialog` opens with the correct folder name and file count

- [ ] **Step 7: Verify pending folder menu**

Create a new folder (without uploading files — it becomes pending). Click ⋯ on it. Confirm the menu shows **only 分享資料夾** — rename and delete items are hidden.

- [ ] **Step 8: Verify dropdown doesn't clip**

Scroll the folder list so the last folder is near the bottom of the sidebar. Open its ⋯ menu and confirm the dropdown either opens upward (if not enough space below) or opens normally — in either case it is not clipped by the sidebar `overflow-y-auto` container.
