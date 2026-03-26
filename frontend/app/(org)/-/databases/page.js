"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../../lib/user-context.js";

export default function DatabasesPage() {
  const { user, hasPermission } = useUser();
  const [tables, setTables] = useState([]);
  const [form, setForm] = useState({ name: "", db_type: "analytical", description: "", columns: [{ name: "", type: "text" }] });
  const [error, setError] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    fetch("/api/tables").then((r) => r.ok ? r.json() : { tables: [] }).then((d) => setTables(d.tables || []));
  };

  const addColumn = () => {
    setForm((f) => ({ ...f, columns: [...f.columns, { name: "", type: "text" }] }));
  };
  const removeColumn = (idx) => {
    setForm((f) => ({ ...f, columns: f.columns.filter((_, i) => i !== idx) }));
  };
  const updateColumn = (idx, field, value) => {
    setForm((f) => ({
      ...f,
      columns: f.columns.map((c, i) => i === idx ? { ...c, [field]: value } : c),
    }));
  };

  const createTable = async (e) => {
    e.preventDefault();
    setError("");
    const cols = form.columns.map((c) => ({
      name: c.name.toLowerCase().replace(/[^a-z0-9_]/g, ""),
      type: c.type,
    }));
    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, columns: cols }),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setForm({ name: "", db_type: "analytical", description: "", columns: [{ name: "", type: "text" }] });
    loadData();
  };

  const deleteTable = async (id, name) => {
    if (!confirm(`Delete table "${name}" and ALL its data?`)) return;
    await fetch(`/api/tables/${id}`, { method: "DELETE" });
    loadData();
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ margin: "0 0 8px" }}>Databases</h1>
      <p style={{ color: "#666", fontSize: 13, margin: "0 0 20px" }}>
        Create tables to store your organization's data. Use API keys to insert and query data via the External API.
      </p>

      {hasPermission("db.create") && (
        <form onSubmit={createTable} style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input placeholder="Table name (lowercase)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} style={inputStyle} />
            <select value={form.db_type} onChange={(e) => setForm({ ...form, db_type: e.target.value })} style={{ ...inputStyle, flex: "none", width: 150 }}>
              <option value="analytical">Analytical</option>
              <option value="transactional">Transactional</option>
            </select>
            <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, flex: 2 }} />
          </div>
          <div style={{ padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong style={{ fontSize: 13 }}>Columns</strong>
              <button type="button" onClick={addColumn} style={btnSmall}>+ Add Column</button>
            </div>
            {form.columns.map((col, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                <input placeholder="column_name" value={col.name} onChange={(e) => updateColumn(i, "name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} style={{ ...inputStyle, flex: 2 }} />
                <select value={col.type} onChange={(e) => updateColumn(i, "type", e.target.value)} style={{ ...inputStyle, flex: "none", width: 130 }}>
                  <option value="text">text</option>
                  <option value="integer">integer</option>
                  <option value="float">float</option>
                  <option value="boolean">boolean</option>
                  <option value="timestamp">timestamp</option>
                  <option value="json">json</option>
                </select>
                {form.columns.length > 1 && (
                  <button type="button" onClick={() => removeColumn(i)} style={btnDanger}>x</button>
                )}
              </div>
            ))}
            <p style={{ fontSize: 11, color: "#999", margin: "8px 0 0" }}>Auto-added: id (bigserial), org_id, created_at</p>
          </div>
          <button type="submit" style={btnBlue}>Create Table</button>
        </form>
      )}
      {error && <p style={{ color: "#e53e3e", margin: "-12px 0 12px" }}>{error}</p>}

      {tables.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Name", "Type", "Columns", "Rows", "Description", "Created", ""].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {tables.map((t) => {
              const cols = typeof t.columns === "string" ? JSON.parse(t.columns) : (t.columns || []);
              return (
                <tr key={t.id}>
                  <td style={tdStyle}><code style={{ fontSize: 12 }}>{t.name}</code></td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: t.db_type === "analytical" ? "#e8f4ff" : "#fef3c7", color: t.db_type === "analytical" ? "#0070f3" : "#92400e" }}>
                      {t.db_type}
                    </span>
                  </td>
                  <td style={tdStyle}><span style={{ fontSize: 12 }}>{cols.map((c) => `${c.name}:${c.type}`).join(", ")}</span></td>
                  <td style={tdStyle}>{t.row_count || 0}</td>
                  <td style={tdStyle}>{t.description}</td>
                  <td style={tdStyle}>{new Date(t.created_at).toLocaleDateString()}</td>
                  <td style={tdStyle}>{hasPermission("db.delete") && <button onClick={() => deleteTable(t.id, t.name)} style={btnDanger}>Delete</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p style={{ color: "#999", fontSize: 14 }}>No tables yet.</p>
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
