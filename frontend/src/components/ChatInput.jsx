import { useState, useRef, useEffect } from "react";

export default function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div
      className={`flex items-center gap-3 card rounded-2xl px-4 py-3 shadow-soft transition-all ${
        disabled ? "opacity-60" : "focus-within:shadow-pop focus-within:border-accent"
      }`}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        className="flex-1 chat-textarea text-sm"
        placeholder="輸入問題，按 Enter 送出 · Shift+Enter 換行"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <button
        onClick={handleSubmit}
        disabled={!canSend}
        className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
          canSend ? "btn btn-primary" : ""
        }`}
        style={!canSend ? { background: "var(--surface-alt)", color: "var(--text-3)", cursor: "not-allowed" } : { padding: 0 }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
        </svg>
      </button>
    </div>
  );
}
