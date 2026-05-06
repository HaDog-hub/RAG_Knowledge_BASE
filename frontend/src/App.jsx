import { useState, useEffect, useCallback, useRef } from "react";
import ChatWindow from "./components/ChatWindow";
import ChatInput from "./components/ChatInput";
import BookshelfSidebar from "./components/BookshelfPanel";
import FolderSelector from "./components/FolderSelector";
import SearchWindow from "./components/SearchWindow";
import AuthPage from "./components/AuthPage";
import ConfirmDialog from "./components/ConfirmDialog";

const API = "";

export default function App() {
  // ── dark mode ───────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  // ── auth ────────────────────────────────────────────────────────────────────
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");
    return token && username ? { token, username } : null;
  });

  const handleAuth = useCallback(({ token, username }) => {
    setAuth({ token, username });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("email");
    setAuth(null);
    setMessages([]);
    setFolderMap({});
    setSharedFolders([]);
    setSelectedFolders([]);
    setConversations([]);
    setCurrentConvId(null);
  }, []);

  const logoutRef = useRef(logout);
  useEffect(() => { logoutRef.current = logout; }, [logout]);

  const authFetch = useCallback((url, options = {}) => {
    const token = localStorage.getItem("token");
    const headers = {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    return fetch(url, { ...options, headers }).then((res) => {
      if (res.status === 401) logoutRef.current();
      return res;
    });
  }, []);

  // ── chat & folder state ─────────────────────────────────────────────────────
  const [mode, setMode] = useState("chat"); // "chat" | "search"
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);   // waiting for response headers → shows TypingIndicator
  const [streaming, setStreaming] = useState(false); // reading stream → shows cursor in message
  const [folderMap, setFolderMap] = useState({});
  const [folderSettings, setFolderSettings] = useState({}); // { [folderName]: boolean (isPublic) }
  const [sharedFolders, setSharedFolders] = useState([]);
  const [selectedFolders, setSelectedFolders] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [currentConvId, setCurrentConvId] = useState(null);

  const fetchFolderMap = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/documents`);
      if (!res.ok) return;
      const data = await res.json();
      setFolderMap(data.folders ?? {});
      setFolderSettings(data.folder_settings ?? {});
      setSharedFolders(data.shared ?? []);
    } catch { /* silent fail */ }
  }, [authFetch]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/conversations`);
      if (!res.ok) return;
      const data = await res.json();
      setConversations(Array.isArray(data) ? data : []);
    } catch { /* silent fail */ }
  }, [authFetch]);

  useEffect(() => {
    if (auth) {
      fetchFolderMap();
      fetchConversations();
    }
  }, [auth, fetchFolderMap, fetchConversations]);

  const handleNewChat = useCallback(() => {
    if (loading || streaming) return;
    setMessages([]);
    setCurrentConvId(null);
  }, [loading, streaming]);

  const [deleteConvTarget, setDeleteConvTarget] = useState(null);

  const handleRenameConv = useCallback(async (convId, newTitle) => {
    try {
      const res = await authFetch(`${API}/api/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!res.ok) return;
      setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, title: newTitle } : c));
    } catch { /* silent */ }
  }, [authFetch]);

  const handleDeleteConvRequest = useCallback((conv) => {
    setDeleteConvTarget(conv);
  }, []);

  const handleDeleteConvConfirm = useCallback(async () => {
    const conv = deleteConvTarget;
    if (!conv) return;
    try {
      const res = await authFetch(`${API}/api/conversations/${conv.id}`, { method: "DELETE" });
      if (!res.ok) return;
      setConversations((prev) => prev.filter((c) => c.id !== conv.id));
      if (conv.id === currentConvId) {
        setMessages([]);
        setCurrentConvId(null);
      }
    } catch { /* silent */ } finally {
      setDeleteConvTarget(null);
    }
  }, [deleteConvTarget, currentConvId, authFetch]);

  const handleRecall = useCallback(async (convId) => {
    if (loading || streaming) return;
    try {
      const res = await authFetch(`${API}/api/conversations/${convId}`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages((data.messages ?? []).map((m) => ({
        role: m.role,
        content: m.content,
        sources: m.sources ?? [],
      })));
      setCurrentConvId(convId);
      const ownFolders = Object.keys(folderMap);
      const sharedFolderNames = sharedFolders.map((s) => s.folder);
      const validFolders = (data.folders ?? []).filter(
        (f) => ownFolders.includes(f) || sharedFolderNames.includes(f)
      );
      setSelectedFolders(validFolders);
      setMode("chat");
    } catch { /* silent */ }
  }, [authFetch, loading, streaming, folderMap, sharedFolders]);

  const handleSend = async (question) => {
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    // Ensure we have a conversation id before streaming starts
    let convId = currentConvId;
    if (convId === null) {
      try {
        const res = await authFetch(`${API}/api/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folders: selectedFolders }),
        });
        if (res.ok) {
          const data = await res.json();
          convId = data.id;
          setCurrentConvId(convId);
          setConversations((prev) => [
            { id: data.id, title: data.title, folders: data.folders, updated_at: data.updated_at },
            ...prev,
          ]);
        }
      } catch { /* silent — chat will still work, just won't be saved */ }
    }

    let assistantText = "";
    let assistantSources = [];

    try {
      const res = await authFetch(`${API}/api/query/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, k: 4, chat_history: history, folders: selectedFolders }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `HTTP ${res.status}`);
      }

      setLoading(false);
      setStreaming(true);
      setMessages((prev) => [...prev, { role: "assistant", content: "", sources: [], streaming: true }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      loop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          let parsed;
          try { parsed = JSON.parse(part.slice(6)); } catch { continue; }

          if (typeof parsed === "string") {
            assistantText += parsed;
            setMessages((prev) => {
              const arr = [...prev];
              const i = arr.length - 1;
              if (arr[i]?.streaming) arr[i] = { ...arr[i], content: arr[i].content + parsed };
              return arr;
            });
          } else if (parsed.sources) {
            assistantSources = parsed.sources;
            setMessages((prev) => prev.map((m) => m.streaming ? { ...m, sources: parsed.sources } : m));
          } else if (parsed.done) {
            setMessages((prev) => prev.map((m) => m.streaming ? { ...m, streaming: false } : m));
            break loop;
          } else if (parsed.error) {
            assistantText = parsed.error;
            assistantSources = [];
            setMessages((prev) => prev.map((m) =>
              m.streaming ? { ...m, content: parsed.error, streaming: false } : m
            ));
            break loop;
          }
        }
      }
    } catch (err) {
      const msg = err?.message?.includes("Failed to fetch")
        ? "無法連線到伺服器，請確認 backend 是否運行。"
        : (err?.message ?? "查詢失敗，請稍後再試。");
      assistantText = msg;
      assistantSources = [];
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.streaming) {
          return [...prev.slice(0, -1), { role: "assistant", content: msg, sources: [] }];
        }
        return [...prev, { role: "assistant", content: msg, sources: [] }];
      });
    } finally {
      setLoading(false);
      setStreaming(false);
      setMessages((prev) => prev.map((m) => m.streaming ? { ...m, streaming: false } : m));

      // Persist this turn to the backend (fire-and-forget, don't block UI)
      if (convId !== null && assistantText) {
        authFetch(`${API}/api/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_msg: question,
            assistant_msg: assistantText,
            sources: assistantSources,
          }),
        })
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            if (!data) return;
            const nowIso = new Date().toISOString();
            setConversations((prev) => {
              const updated = prev.map((c) =>
                c.id === convId
                  ? { ...c, title: data.title ?? c.title, updated_at: nowIso }
                  : c
              );
              return [...updated].sort(
                (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
              );
            });
          })
          .catch(() => { /* silent */ });
      }
    }
  };

  // ── render ──────────────────────────────────────────────────────────────────
  if (!auth) return <AuthPage onAuth={handleAuth} />;

  return (
    <div className="flex h-screen bg-bg overflow-hidden">

      <BookshelfSidebar
        folderMap={folderMap}
        folderSettings={folderSettings}
        sharedFolders={sharedFolders}
        onRefresh={fetchFolderMap}
        authFetch={authFetch}
        username={auth.username}
        onLogout={logout}
        conversations={conversations}
        currentConvId={currentConvId}
        onNewChat={handleNewChat}
        onSelectConv={handleRecall}
        onRenameConv={handleRenameConv}
        onDeleteConv={handleDeleteConvRequest}
        streaming={loading || streaming}
      />

      <div className="flex flex-col flex-1 min-w-0 bg-bg">

        <header className="flex items-center gap-3 px-6 py-3 bg-header border-b border-1 shrink-0">
          <div className="brand-mark w-8 h-8 rounded-lg text-base shrink-0">
            R
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display font-semibold text-1 text-lg leading-none tracking-tight">
              <span className="text-accent font-mono text-sm align-middle mr-1">RAG</span><span className="align-middle">知識庫</span>
            </h1>
            <p className="label-mono mt-1">Knowledge Base · AI Query</p>
          </div>
          {/* mode toggle */}
          <div className="tab-bar shrink-0 mr-1">
            {[["chat", "對話"], ["search", "搜尋"]].map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`tab-button ${mode === m ? "tab-button-active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* dark mode toggle */}
          <button
            onClick={() => {
              document.documentElement.classList.add("no-transitions");
              setDarkMode((d) => !d);
              requestAnimationFrame(() =>
                requestAnimationFrame(() =>
                  document.documentElement.classList.remove("no-transitions")
                )
              );
            }}
            title={darkMode ? "切換亮色模式" : "切換暗色模式"}
            className="btn-icon shrink-0 w-8 h-8"
          >
            {darkMode ? (
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            ) : (
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
              </svg>
            )}
          </button>
        </header>

        <FolderSelector
          folders={Object.keys(folderMap)}
          selected={selectedFolders}
          onChange={setSelectedFolders}
        />

        {mode === "chat" ? (
          <>
            <ChatWindow messages={messages} loading={loading} />
            <div className="shrink-0 px-6 pb-5 pt-2">
              <ChatInput onSend={handleSend} disabled={loading || streaming} />
            </div>
          </>
        ) : (
          <SearchWindow
            authFetch={authFetch}
            selectedFolders={selectedFolders}
            onAskAI={(q) => { setMode("chat"); handleSend(q); }}
          />
        )}
      </div>

      <ConfirmDialog
        open={!!deleteConvTarget}
        title="刪除對話"
        message={deleteConvTarget ? `確定刪除「${deleteConvTarget.title ?? "未命名對話"}」？此動作無法復原。` : ""}
        confirmLabel="刪除"
        onConfirm={handleDeleteConvConfirm}
        onCancel={() => setDeleteConvTarget(null)}
      />
    </div>
  );
}
