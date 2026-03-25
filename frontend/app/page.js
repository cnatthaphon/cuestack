"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Init DB + seed admin on first load
    fetch("/api/init").catch(() => {});
    // Get current user
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setUser(data.user))
      .catch(() => {
        window.location.href = "/login";
      });
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  if (!user) return <p style={{ padding: 40 }}>Loading...</p>;

  return (
    <div style={{ padding: 40, maxWidth: 800 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>IoT Stack Dashboard</h1>
        <div>
          <span style={{ marginRight: 16, color: "#666" }}>
            {user.username} ({user.role})
          </span>
          {user.role === "admin" && (
            <a href="/admin" style={{ marginRight: 16, color: "#0070f3" }}>
              Admin
            </a>
          )}
          <button onClick={handleLogout} style={btnStyle}>
            Logout
          </button>
        </div>
      </div>
      <p style={{ color: "#666" }}>
        Dashboard ready. Pipeline features will be added in upcoming branches.
      </p>
      <div style={{ marginTop: 24, padding: 20, background: "#f7f7f7", borderRadius: 8 }}>
        <h3 style={{ margin: "0 0 12px" }}>Sprint 1 Progress</h3>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>✅ Docker Compose (Next.js + FastAPI + PostgreSQL + nginx)</li>
          <li>✅ Authentication (bcrypt, JWT, HttpOnly cookies)</li>
          <li>⬜ Block Base (Pipeline, PipelineContext)</li>
          <li>⬜ ValidateBlock + TransformBlock</li>
          <li>⬜ StoreBlock + sensor_data table</li>
          <li>⬜ QueryBlock + AggregateBlock + FormatBlock</li>
          <li>⬜ Pipeline API routes</li>
          <li>⬜ Dashboard with live data</li>
        </ul>
      </div>
    </div>
  );
}

const btnStyle = {
  padding: "8px 16px",
  background: "#666",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};
