import { useEffect, useRef } from "react";

function BotAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-surface-alt border border-1 flex items-center justify-center shrink-0 mt-0.5">
      <svg className="w-4 h-4 text-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
      </svg>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-3">
      <BotAvatar />
      <div className="card rounded-2xl rounded-bl-sm px-4 py-3 shadow-soft">
        <div className="flex gap-1.5 items-center h-5">
          <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: "0ms", background: "var(--text-3)" }} />
          <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: "150ms", background: "var(--text-3)" }} />
          <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: "300ms", background: "var(--text-3)" }} />
        </div>
      </div>
    </div>
  );
}

export default function ChatWindow({ messages, loading }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  if (messages.length === 0 && !loading) {
    const features = [
      {
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
        ),
        title: "跨文件分析",
        desc: "整合多份文件，統一回答問題",
      },
      {
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
        ),
        title: "語意搜尋",
        desc: "理解語意，不只是關鍵詞匹配",
      },
      {
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
          </svg>
        ),
        title: "資料夾管理",
        desc: "分類整理，拖曳移動文件",
      },
      {
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
          </svg>
        ),
        title: "知識共享",
        desc: "與他人共享指定資料夾",
      },
    ];

    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 select-none chat-ambient">
        <div className="flex flex-col items-center gap-2 mb-10 fade-up">
          <div className="brand-mark w-12 h-12 rounded-2xl text-xl mb-2">R</div>
          <p className="font-display text-2xl text-1 tracking-tight">開始提問</p>
          <p className="label-mono">上傳文件 · 選擇範圍 · 向 AI 提問</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm fade-up-2">
          {features.map((f) => (
            <div key={f.title} className="card p-4 flex flex-col gap-1.5 hover:border-accent transition-colors">
              <div className="text-accent">{f.icon}</div>
              <p className="text-xs font-semibold text-1 leading-tight">{f.title}</p>
              <p className="text-[11px] text-3 leading-snug">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 chat-ambient">
      {messages.map((msg, i) => (
        <div key={i} className={`msg-in flex items-end gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
          {msg.role === "assistant" && <BotAvatar />}
          <div
            className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "user"
                ? "rounded-br-sm shadow-soft"
                : "card border-l-2 rounded-bl-sm shadow-soft"
            }`}
            style={msg.role === "user"
              ? { background: "linear-gradient(135deg, var(--user-bubble-from), var(--user-bubble-to))", color: "var(--user-text)" }
              : { borderLeftColor: "var(--accent)" }
            }
          >
            <p className="whitespace-pre-wrap break-words">
              {msg.content}
              {msg.streaming && (
                <span className="cursor-blink inline-block w-[2px] h-[0.9em] bg-current ml-[1px] align-text-bottom rounded-[1px]" />
              )}
            </p>
            {msg.sources && msg.sources.length > 0 && (
              <div
                className="mt-3 pt-2.5 flex flex-wrap gap-1.5"
                style={{ borderTop: msg.role === "user" ? "1px solid rgba(255,245,230,0.25)" : "1px solid var(--border)" }}
              >
                {msg.sources.map((src, j) => (
                  <span
                    key={j}
                    className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded border tracking-tight max-w-[200px]"
                    style={msg.role === "user"
                      ? { background: "rgba(255,245,230,0.10)", color: "var(--user-text)", borderColor: "rgba(255,245,230,0.20)" }
                      : { background: "var(--surface-alt)", color: "var(--text-2)", borderColor: "var(--border)" }
                    }
                  >
                    <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                    <span className="truncate">{src}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
      {loading && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
