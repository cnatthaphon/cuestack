"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../lib/user-context.js";

export default function NotebooksPage() {
  const { user, org, hasFeature } = useUser();
  const [jupyterUrl, setJupyterUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Auto-check existing session on mount
  useEffect(() => {
    fetch("/api/notebooks")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.url) setJupyterUrl(d.url); })
      .catch(() => {});
  }, []);

  if (!user) return null;

  if (!hasFeature("notebooks")) {
    return (
      <div style={{ maxWidth: 900 }}>
        <h1 style={{ margin: "0 0 8px" }}>Notebooks</h1>
        <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
          Notebooks feature is not enabled for your organization. Contact your admin.
        </div>
      </div>
    );
  }

  const startSession = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "default" }),
      });
      if (!res.ok) {
        setError((await res.json()).error);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setJupyterUrl(data.url);
    } catch {
      setError("Failed to start notebook session");
    }
    setLoading(false);
  };

  // Full-screen Jupyter embed
  if (jupyterUrl) {
    return (
      <div style={{ margin: -32, display: "flex", flexDirection: "column", height: "100vh" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "8px 16px", background: "#1a1a2e", color: "#fff", fontSize: 13, flexShrink: 0,
        }}>
          <div>
            <strong>Notebooks</strong>
            <span style={{ color: "#888", marginLeft: 12 }}>{org?.name}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => window.open(jupyterUrl, "_blank")}
              style={toolbarBtn}
            >
              Open in new tab
            </button>
            <button onClick={() => setJupyterUrl(null)} style={toolbarBtn}>
              Back
            </button>
          </div>
        </div>
        <iframe
          src={jupyterUrl}
          style={{ flex: 1, border: "none", width: "100%" }}
          title="JupyterLab"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    );
  }

  // Launch screen
  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 8px" }}>Notebooks</h1>
      <p style={{ color: "#666", fontSize: 13, margin: "0 0 24px" }}>
        Jupyter notebooks with direct access to your organization's database.
      </p>

      <div style={{ padding: 32, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{"\u{1F4D3}"}</div>
        <h2 style={{ margin: "0 0 8px" }}>Start a Notebook Session</h2>
        <p style={{ color: "#666", fontSize: 14, margin: "0 0 24px", maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
          Launch JupyterLab with pre-configured database access.
          Available: pandas, numpy, matplotlib, plotly, scikit-learn.
        </p>
        <button onClick={startSession} disabled={loading} style={{
          padding: "12px 32px", background: "#0070f3", color: "#fff",
          border: "none", borderRadius: 6, cursor: loading ? "wait" : "pointer",
          fontSize: 16, fontWeight: 600, opacity: loading ? 0.7 : 1,
        }}>
          {loading ? "Starting..." : "Launch JupyterLab"}
        </button>
        {error && <p style={{ color: "#e53e3e", marginTop: 12 }}>{error}</p>}
      </div>

      <div style={{ marginTop: 24, padding: 20, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Quick Start</h3>
        <pre style={{ background: "#f7f7f7", padding: 16, borderRadius: 6, fontSize: 13, overflow: "auto", lineHeight: 1.6 }}>
{`# Auto-injected: query(), tables(), db (SQLAlchemy engine)

# List your org's tables
tables()

# Query data into a DataFrame
df = query("SELECT * FROM org_tables WHERE org_id = :org_id",
           {"org_id": "${user.org_id}"})

# Plot
import matplotlib.pyplot as plt
df.plot(kind="bar")
plt.show()`}
        </pre>
      </div>
    </div>
  );
}

const toolbarBtn = {
  padding: "4px 12px", background: "rgba(255,255,255,0.1)",
  border: "1px solid #444", borderRadius: 4, color: "#aaa",
  cursor: "pointer", fontSize: 12,
};
