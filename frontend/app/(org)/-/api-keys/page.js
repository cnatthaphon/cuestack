"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../../lib/user-context.js";

export default function ApiKeysPage() {
  const { user } = useUser();
  const [tables, setTables] = useState([]);
  const [keys, setKeys] = useState([]);
  const [form, setForm] = useState({ name: "", permissions: [], expires_in_days: "" });
  const [newKey, setNewKey] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    fetch("/api/tables").then((r) => r.ok ? r.json() : { tables: [] }).then((d) => setTables(d.tables || []));
    fetch("/api/keys").then((r) => r.ok ? r.json() : { keys: [] }).then((d) => setKeys(d.keys || []));
  };

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

  const createKey = async (e) => {
    e.preventDefault();
    setError("");
    setNewKey(null);
    const body = { name: form.name, permissions: form.permissions };
    if (form.expires_in_days) body.expires_in_days = parseInt(form.expires_in_days);
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    const data = await res.json();
    setNewKey(data.key);
    setForm({ name: "", permissions: [], expires_in_days: "" });
    loadData();
  };

  const toggleKeyActive = async (keyId, currentActive) => {
    await fetch(`/api/keys/${keyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !currentActive }),
    });
    loadData();
  };

  const deleteKey = async (id, name) => {
    if (!confirm(`Revoke API key "${name}"?`)) return;
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    loadData();
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ margin: "0 0 8px" }}>API Keys</h1>
      <p style={{ color: "#666", fontSize: 13, margin: "0 0 20px" }}>
        Create API keys for external access to your data. Keys are shown only once — save them securely.
      </p>

      {newKey && (
        <div style={{ padding: 16, background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, marginBottom: 16 }}>
          <strong style={{ color: "#92400e" }}>Save this key now — it will not be shown again:</strong>
          <div style={{ marginTop: 8, padding: 8, background: "#fff", borderRadius: 4, fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}>{newKey}</div>
          <button onClick={() => navigator.clipboard.writeText(newKey)} style={{ ...btnSmall, marginTop: 8 }}>Copy to Clipboard</button>
        </div>
      )}

      <form onSubmit={createKey} style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input placeholder="Key name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          <input type="number" placeholder="Expires in days (empty = never)" value={form.expires_in_days} onChange={(e) => setForm({ ...form, expires_in_days: e.target.value })} style={{ ...inputStyle, width: 220, flex: "none" }} />
          <button type="submit" style={btnBlue}>Create Key</button>
        </div>
        {tables.length > 0 && (
          <div style={{ padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
            <strong style={{ fontSize: 13 }}>Table Permissions</strong>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, background: "transparent", border: "none" }}>Table</th>
                  <th style={{ ...thStyle, background: "transparent", border: "none", width: 60, textAlign: "center" }}>Read</th>
                  <th style={{ ...thStyle, background: "transparent", border: "none", width: 60, textAlign: "center" }}>Write</th>
                </tr>
              </thead>
              <tbody>
                {tables.map((t) => {
                  const perm = form.permissions.find((p) => p.table === t.name);
                  return (
                    <tr key={t.id}>
                      <td style={{ padding: 4, fontSize: 13 }}><code>{t.name}</code></td>
                      <td style={{ padding: 4, textAlign: "center" }}>
                        <input type="checkbox" checked={perm?.read || false} onChange={() => toggleTablePerm(t.name, "read")} />
                      </td>
                      <td style={{ padding: 4, textAlign: "center" }}>
                        <input type="checkbox" checked={perm?.write || false} onChange={() => toggleTablePerm(t.name, "write")} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </form>
      {error && <p style={{ color: "#e53e3e", margin: "-12px 0 12px" }}>{error}</p>}

      {keys.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Name", "Prefix", "Permissions", "Active", "Last Used", "Expires", "Created", ""].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const perms = typeof k.permissions === "string" ? JSON.parse(k.permissions) : (k.permissions || []);
              return (
                <tr key={k.id}>
                  <td style={tdStyle}>{k.name}</td>
                  <td style={tdStyle}><code style={{ fontSize: 12 }}>{k.key_prefix}...</code></td>
                  <td style={tdStyle}><span style={{ fontSize: 11 }}>{perms.map((p) => `${p.table}(${p.read ? "R" : ""}${p.write ? "W" : ""})`).join(", ") || "none"}</span></td>
                  <td style={tdStyle}>
                    <button onClick={() => toggleKeyActive(k.id, k.is_active)} style={{ ...btnSmall, color: k.is_active ? "#38a169" : "#e53e3e" }}>
                      {k.is_active ? "Active" : "Disabled"}
                    </button>
                  </td>
                  <td style={tdStyle}>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}</td>
                  <td style={tdStyle}>{k.expires_at ? new Date(k.expires_at).toLocaleDateString() : "Never"}</td>
                  <td style={tdStyle}>{new Date(k.created_at).toLocaleDateString()}</td>
                  <td style={tdStyle}><button onClick={() => deleteKey(k.id, k.name)} style={btnDanger}>Revoke</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p style={{ color: "#999", fontSize: 14 }}>No API keys yet.</p>
      )}
    </div>
  );
}

const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 14, flex: 1 };
const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap" };
const btnSmall = { padding: "4px 8px", background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const btnDanger = { padding: "4px 8px", background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12 };
const thStyle = { border: "1px solid #ddd", padding: 8, background: "#f5f5f5", textAlign: "left", fontSize: 13 };
const tdStyle = { border: "1px solid #ddd", padding: 8, fontSize: 13 };
