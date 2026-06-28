import { useState } from "react";

export default function Login({ onLoginSuccess, onCall }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Note: We use the provided onCall (callApi) which won't have a token yet.
      // The /api/auth/login route should be unprotected on the backend.
      const result = await onCall("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });

      if (result && result.success && result.token) {
        onLoginSuccess(result.token);
      } else {
        setError(result?.message || result?.error || "Invalid credentials");
      }
    } catch (err) {
      setError("Failed to connect to authentication server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell" style={{ background: 'var(--background-dark)' }}>
      <div className="panel login-panel" style={{ background: 'var(--background-light)' }}>
        <h2 style={{ color: 'var(--text-light)' }}>Mining Tool</h2>
        <p className="subtitle">Sign in to manage your rigs</p>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="field">
            <label className="label">USERNAME</label>
            <input type="text" className="input-pro" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label">PASSWORD</label>
            <input type="password" className="input-pro" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="btn-pro primary" disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
