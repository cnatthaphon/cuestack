"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { DateTimeCell } from "../../../../lib/components/data-table.js";

export default function NotebooksPage() {
  const { user, org, hasFeature } = useUser();
  const [sessions, setSessions] = useState([]);
  const [jupyterUrl, setJupyterUrl] = useState(null);
  const [showJupyter, setShowJupyter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => { loadSessions(); }, []);

  const loadSessions = async () => {
    const res = await fetch("/api/notebooks");
    if (res.ok) {
      const d = await res.json();
      setSessions(d.sessions || []);
      if (d.url) setJupyterUrl(d.url); // store URL but don't auto-open
    }
  };

  if (!user) return null;

  if (!hasFeature("notebooks")) {
    return (
      <div style={{ maxWidth: 900 }}>
        <h1 style={{ margin: "0 0 8px" }}>Notebooks</h1>
        <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
          Notebooks feature is not enabled for your organization.
        </div>
      </div>
    );
  }

  const startSession = async (name) => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/notebooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "default" }),
    });
    if (!res.ok) { setError((await res.json()).error); setLoading(false); return; }
    const data = await res.json();
    setNewName("");
    setJupyterUrl(data.url);
    setShowJupyter(true);
    loadSessions();
    setLoading(false);
  };

  const openNotebook = (name) => {
    startSession(name || "default");
  };

  // Jupyter iframe view — only shown when user explicitly opens a notebook
  if (showJupyter && jupyterUrl) {
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
            <button onClick={() => window.open(jupyterUrl, "_blank")} style={toolbarBtn}>New tab</button>
            <button onClick={() => setShowJupyter(false)} style={toolbarBtn}>Back to list</button>
          </div>
        </div>
        <iframe src={jupyterUrl} style={{ flex: 1, border: "none", width: "100%" }} title="JupyterLab" allow="clipboard-read; clipboard-write" />
      </div>
    );
  }

  // Notebook sessions list — always shown by default
  const columns = [
    { key: "key", label: "Notebook" },
    { key: "username", label: "Created By" },
    { key: "status", label: "Status", render: (v) => (
      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
        background: v === "active" ? "#f0fde8" : "#f7f7f7",
        color: v === "active" ? "#38a169" : "#999",
      }}>{v}</span>
    )},
    { key: "updated_at", label: "Last Active", render: (v) => <DateTimeCell value={v} /> },
  ];

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 16px" }}>Notebooks</h1>

      <DataTable
        columns={columns}
        data={sessions}
        idKey="key"
        searchKeys={["key", "username"]}
        onRowClick={(row) => openNotebook(row.key)}
        actions={(row) => (
          <button onClick={() => openNotebook(row.key)} style={btnSmall}>Open</button>
        )}
        toolbar={
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder="Notebook name" value={newName} onChange={(e) => setNewName(e.target.value)}
              style={{ padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, width: 160 }}
              onKeyDown={(e) => e.key === "Enter" && openNotebook(newName)} />
            <button onClick={() => openNotebook(newName)} disabled={loading} style={btnBlue}>
              {loading ? "Starting..." : "New Notebook"}
            </button>
          </div>
        }
        emptyMessage="No notebook sessions yet. Create one to get started."
      />
      {error && <p style={{ color: "#e53e3e", margin: "8px 0 0", fontSize: 13 }}>{error}</p>}

      <div style={{ marginTop: 24, padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Quick Start</h3>
        <pre style={{ background: "#f7f7f7", padding: 12, borderRadius: 6, fontSize: 12, overflow: "auto", lineHeight: 1.6, margin: 0 }}>
{`# Auto-injected: query(), tables(), files(), db
tables()                    # list your org's tables
df = query("SELECT ...")    # query into DataFrame
files()                     # list org file storage`}
        </pre>
      </div>
    </div>
  );
}

const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const btnSmall = { padding: "4px 12px", background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12, color: "#0070f3" };
const toolbarBtn = { padding: "4px 12px", background: "rgba(255,255,255,0.1)", border: "1px solid #444", borderRadius: 4, color: "#aaa", cursor: "pointer", fontSize: 12 };
