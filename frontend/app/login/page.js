"use client";

import { useState } from "react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body = { username, password };
      if (orgSlug.trim()) body.org_slug = orgSlug.trim();

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      // Super admin → /super, org user → /
      if (data.user.is_super_admin) {
        window.location.href = "/super";
      } else {
        window.location.href = "/";
      }
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <form onSubmit={handleLogin} style={formStyle}>
        <h1 style={{ margin: "0 0 8px" }}>IoT Stack</h1>
        <p style={{ color: "#666", margin: "0 0 24px" }}>Login to continue</p>
        {error && <p style={{ color: "#e53e3e", margin: "0 0 12px" }}>{error}</p>}
        <input
          type="text"
          placeholder="Organization (slug)"
          value={orgSlug}
          onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          style={inputStyle}
          autoComplete="organization"
        />
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={inputStyle}
          autoFocus
          autoComplete="username"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          autoComplete="current-password"
        />
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? "Logging in..." : "Login"}
        </button>
        <p style={{ color: "#999", fontSize: 13, marginTop: 16 }}>
          Super admin: leave org empty, admin / admin<br />
          Demo org: demo, demo / demo1234
        </p>
      </form>
    </div>
  );
}

const containerStyle = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "100vh",
  background: "#f0f2f5",
};
const formStyle = {
  background: "#fff",
  padding: 40,
  borderRadius: 12,
  boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
  width: 360,
};
const inputStyle = {
  display: "block",
  width: "100%",
  padding: 12,
  marginBottom: 12,
  border: "1px solid #ddd",
  borderRadius: 6,
  fontSize: 16,
  boxSizing: "border-box",
};
const btnStyle = {
  width: "100%",
  padding: 12,
  background: "#0070f3",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  cursor: "pointer",
};
