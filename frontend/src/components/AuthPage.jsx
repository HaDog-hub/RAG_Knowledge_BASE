import { useState } from "react";

const API = "";

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body = mode === "login"
      ? { username: username.trim(), password }
      : { username: username.trim(), password, email: email.trim() };

    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (Array.isArray(data.detail)) {
          setError(data.detail.map((e) => e.msg.replace("Value error, ", "")).join("、"));
        } else {
          setError(data.detail ?? "發生未知錯誤，請稍後再試。");
        }
        return;
      }
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("username", data.username);
      if (data.email) localStorage.setItem("email", data.email);
      onAuth({ token: data.access_token, username: data.username, email: data.email });
    } catch {
      setError("無法連線到伺服器，請確認 backend 是否運行。");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m) => {
    setMode(m);
    setError("");
    setPassword("");
  };

  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <div className="w-full max-w-sm mx-4">

        <div className="flex flex-col items-center mb-8 fade-up">
          <div className="brand-mark w-14 h-14 rounded-2xl text-2xl mb-4">R</div>
          <h1 className="font-display text-2xl text-1 tracking-tight">
            <span className="text-accent font-mono text-base align-middle mr-1.5">RAG</span>
            <span className="align-middle">知識庫</span>
          </h1>
          <p className="label-mono mt-2">Knowledge Base · AI Query</p>
        </div>

        <div className="dialog-panel dialog-panel-accent p-6 fade-up-2">

          <div className="tab-bar w-full mb-6">
            {[["login", "登入"], ["register", "註冊"]].map(([m, label]) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`tab-button flex-1 py-1.5 text-sm ${mode === m ? "tab-button-active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="label-mono block mb-2">用戶名 · USERNAME</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="請輸入用戶名"
                autoComplete="username"
                required
                className="input-field"
              />
            </div>

            {mode === "register" && (
              <div>
                <label className="label-mono block mb-2">EMAIL</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoComplete="email"
                  required
                  className="input-field"
                />
              </div>
            )}

            <div>
              <label className="label-mono block mb-2">密碼 · PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "至少 8 字元" : "請輸入密碼"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                className="input-field"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm pill-danger" style={{ fontFamily: "inherit", fontSize: "0.875rem" }}>
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username.trim() || !password || (mode === "register" && !email.trim())}
              className="btn btn-primary w-full mt-1 py-2.5"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  處理中…
                </span>
              ) : mode === "login" ? "登入" : "建立帳號"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
