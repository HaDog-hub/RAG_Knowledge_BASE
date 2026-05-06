# Folder Button Consolidation Design

**Date:** 2026-05-04
**Status:** Approved

## Problem

The sidebar is `w-72` (288px). Each folder row's right-side shows up to 5 elements on hover (file count badge, visibility toggle, share, rename, delete, chevron), leaving fewer than 100px for the folder name — causing it to truncate on nearly any non-trivial name.

## Solution: ⋯ Dropdown Menu (Option A)

Consolidate Share, Rename, and Delete into a single `⋯` overflow menu that appears on hover. The visibility toggle stays inline because it conveys persistent state at a glance.

## Folder Row Layout

### Right-side elements

| Element | Visibility |
|---|---|
| File count badge | Always |
| Visibility toggle icon (globe / lock) | Public → always shown; Private → hover only (consistent with current behavior) |
| `⋯` button | Hover only |
| Collapse chevron ▾ | Always |

### ⋯ Dropdown menu items

1. 分享資料夾 (Share folder)
2. 重新命名 (Rename)
3. `---` divider
4. 刪除資料夾 (Delete — danger/red style)

## Component Design

### State

Add a single state to `BookshelfSidebar`:

```js
const [menuOpenFolder, setMenuOpenFolder] = useState(null); // folder name | null
```

No per-folder state needed — at most one menu is open at a time.

### FolderMenu component

A small presentational component that renders the dropdown. Accepts:
- `folder` — the folder name it belongs to
- `anchorRef` — ref to the ⋯ button for positioning
- `onShare`, `onRename`, `onDelete`, `onClose` — callbacks

### Portal rendering

The folder card has `overflow: hidden`, which clips absolutely-positioned children. The dropdown must be rendered into `document.body` via `ReactDOM.createPortal`. Position is computed from `anchorRef.current.getBoundingClientRect()` on open.

### Positioning

Dropdown opens below the ⋯ button, right-edge aligned. If there is insufficient space below (bottom of viewport), flip to open upward. Use `getBoundingClientRect()` + `window.innerHeight` to decide.

### Close behavior

- Click outside: `mousedown` listener on `document` (added on open, removed on close)
- Escape key: `keydown` listener on `document`
- Menu item selected: call `onClose()` then the action handler

## Mobile (Future)

Long-press (≥500ms touch) on a folder row triggers the same ⋯ dropdown. Implementation options:
- `onContextMenu` event (maps to long-press on iOS Safari and Chrome Android)
- `touchstart` + 500ms `setTimeout`, cancelled on `touchend`/`touchmove`

Detect touch-only devices via `@media (hover: none)` if platform-specific styles are needed.

## Files Changed

- `frontend/src/components/BookshelfPanel.jsx` — all changes contained here
  - Add `menuOpenFolder` state to `BookshelfSidebar`
  - Add `FolderMenu` component (portal-based dropdown)
  - Update `FolderTree` props to pass menu open/close handlers
  - Update folder row JSX to replace share/rename/delete `IconBtn`s with a single `⋯` `IconBtn` + `FolderMenu`

## Out of Scope

- File-level buttons (AI summary, rename, delete) — not changed
- Shared folders section — read-only, no action buttons
- Mobile long-press implementation — deferred to future mobile sprint
