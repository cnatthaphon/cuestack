"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "../../../../../lib/user-context.js";

export default function NewApiKeyPage() {
  const { user } = useUser();
  const [tables, setTables] = useState([]);
  const [form, setForm] = useState({ name: "", permissions: [], expires_in_days: "" });
  const [newKey, setNewKey] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/tables").then((r) => r.ok ? r.json() : { tables: [] }).then((d) => setTables(d.tables || []));
  }, []);

  const toggleTablePerm = (tableName, action) => {
    setForm((f) => {
      const existing = f.permissions.find((p) => p.table === tableName);
      if (existing) {
        const newPerms = existing[action]
          ? f.permissions.map((p) => p.table === tableName ? { ...p, [action]: false } : p)
          : f.permissions.map((p) => p.table === tableName ? { ...p, [action]: true } : p);
        return { ...f, permissions: newPerms.filter((p) => p.read || p.write) };
      }
      return { ...f, permissions: [...f.permissions, { table: tableName, [action]: true }] };
    });
  };

  const create = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    if (!form.name) { setError("Key name is required"); setSaving(false); return; }

    const body = { name: form.name, permissions: form.permissions };
    if (form.expires_in_days) body.expires_in_days = parseInt(form.expires_in_days);

    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setError((await res.json()).error);
      setSaving(false);
      return;
    }

    const data = await res.json();
    setNewKey(data.key);
    setSaving(false);
  };

  if (!user) return null;

  if (newKey) {
    return (
      <div style={{ maxWidth: 700 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <Link href="/-/api-keys" style={{ color: "#666", textDecoration: "none", fontSize: 13 }}>&larr; API Keys</Link>
          <h1 style={{ margin: 0, fontSize: 20 }}>API Key Created</h1>
        </div>

        <div style={{ padding: 20, background: "#fef3c7", border: "2px solid #f59e0b", borderRadius: 8 }}>
          <strong style={{ color: "#92400e", fontSize: 14 }}>Save this key now — it will not be shown again!</strong>
          <div style={{ marginTop: 12, padding: 12, background: "#fff", borderRadius: 4, fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}>
            {newKey}
          </div>
          <button onClick={() => navigator.clipboard.writeText(newKey)}
            style={{ marginTop: 12, padding: "6px 16px", background: "#92400e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
            Copy to Clipboard
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <Link href="/-/api-keys" style={{ color: "#0070f3", textDecoration: "none", fontSize: 13 }}>&larr; Back to API Keys</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/-/api-keys" style={{ color: "#666", textDecoration: "none", fontSize: 13 }}>&larr; API Keys</Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>New API Key</h1>
      </div>

      <form onSubmit={create} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 24 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>Key Settings</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <label style={labelStyle}>Key Name *
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={inputStyle} />
          </label>
          <label style={labelStyle}>Expires In (days)
            <input type="number" placeholder="Empty = never" value={form.expires_in_days}
              onChange={(e) => setForm({ ...form, expires_in_days: e.target.value })} style={inputStyle} />
          </label>
        </div>

        {tables.length > 0 && (
          <>
            <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Table Permissions</h2>
            <div style={{ padding: 12, background: "#f9fafb", borderRadius: 6, border: "1px solid #eee", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Table</th>
                    <th style={{ ...thStyle, width: 60, textAlign: "center" }}>Read</th>
                    <th style={{ ...thStyle, width: 60, textAlign: "center" }}>Write</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map((t) => {
                    const perm = form.permissions.find((p) => p.table === t.name);
                    return (
                      <tr key={t.id}>
                        <td style={{ padding: 6, fontSize: 13 }}><code>{t.name}</code></td>
                        <td style={{ padding: 6, textAlign: "center" }}>
                          <input type="checkbox" checked={perm?.read || false} onChange={() => toggleTablePerm(t.name, "read")} />
                        </td>
                        <td style={{ padding: 6, textAlign: "center" }}>
                          <input type="checkbox" checked={perm?.write || false} onChange={() => toggleTablePerm(t.name, "write")} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {error && <p style={{ color: "#e53e3e", margin: "0 0 12px", fontSize: 13 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving} style={btnBlue}>{saving ? "Creating..." : "Create API Key"}</button>
          <Link href="/-/api-keys" style={btnGrayLink}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, color: "#555" };
const inputStyle = { display: "block", width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, marginTop: 4, boxSizing: "border-box" };
const btnBlue = { padding: "8px 20px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnGrayLink = { padding: "8px 20px", background: "#666", color: "#fff", borderRadius: 4, fontSize: 13, textDecoration: "none", display: "inline-block" };
const thStyle = { padding: 6, textAlign: "left", fontSize: 12, color: "#666", borderBottom: "1px solid #eee" };
