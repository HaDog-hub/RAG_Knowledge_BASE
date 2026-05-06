export default function FolderSelector({ folders, selected, onChange }) {
  if (folders.length === 0) return null;

  const toggle = (folder) => {
    onChange(
      selected.includes(folder)
        ? selected.filter((f) => f !== folder)
        : [...selected, folder]
    );
  };

  const allSelected = selected.length === 0;

  return (
    <div className="flex items-center gap-2 px-6 py-2 bg-header border-b border-1 overflow-x-auto shrink-0">
      <span className="label-mono shrink-0 pr-3 mr-1 border-r border-1">SCOPE</span>
      <button
        onClick={() => onChange([])}
        className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-all ${
          allSelected ? "btn-primary" : "btn-ghost"
        }`}
      >
        全部
      </button>
      {folders.map((folder) => (
        <button
          key={folder}
          onClick={() => toggle(folder)}
          className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-all max-w-[140px] truncate ${
            selected.includes(folder) ? "btn-primary" : "btn-ghost"
          }`}
        >
          {folder}
        </button>
      ))}
    </div>
  );
}
