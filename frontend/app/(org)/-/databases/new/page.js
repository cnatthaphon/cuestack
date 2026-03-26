"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "../../../../../lib/user-context.js";

export default function NewDatabasePage() {
  const { user } = useUser();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", db_type: "analytical", description: "", columns: [{ name: "", type: "text" }] });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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

  const create = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    if (!form.name) { setError("Table name is required"); setSaving(false); return; }

    const cols = form.columns.map((c) => ({
      name: c.name.toLowerCase().replace(/[^a-z0-9_]/g, ""),
      type: c.type,
    })).filter((c) => c.name);

    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, columns: cols }),
    });

    if (!res.ok) {
      setError((await res.json()).error);
      setSaving(false);
      return;
    }

    router.push("/-/databases");
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/-/databases" style={{ color: "#666", textDecoration: "none", fontSize: 13 }}>&larr; Databases</Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>New Table</h1>
      </div>

      <form onSubmit={create} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 24 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>Table Settings</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <label style={labelStyle}>Table Name *
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} required placeholder="lowercase_name" style={inputStyle} />
          </label>
          <label style={labelStyle}>Database Type
            <select value={form.db_type} onChange={(e) => setForm({ ...form, db_type: e.target.value })} style={inputStyle}>
              <option value="analytical">Analytical (ClickHouse)</option>
              <option value="transactional">Transactional (PostgreSQL)</option>
            </select>
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>Description
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inputStyle} />
          </label>
        </div>

        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Columns</h2>
        <div style={{ padding: 12, background: "#f9fafb", borderRadius: 6, border: "1px solid #eee", marginBottom: 16 }}>
          {form.columns.map((col, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input placeholder="column_name" value={col.name}
                onChange={(e) => updateColumn(i, "name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                style={{ ...inputStyle, flex: 2 }} />
              <select value={col.type} onChange={(e) => updateColumn(i, "type", e.target.value)} style={{ ...inputStyle, flex: "none", width: 130 }}>
                <option value="text">text</option>
                <option value="integer">integer</option>
                <option value="float">float</option>
                <option value="boolean">boolean</option>
                <option value="timestamp">timestamp</option>
                <option value="json">json</option>
              </select>
              {form.columns.length > 1 && (
                <button type="button" onClick={() => removeColumn(i)} style={{ padding: "4px 8px", background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 14 }}>x</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addColumn} style={{ padding: "4px 12px", background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12, marginTop: 4 }}>+ Add Column</button>
          <p style={{ fontSize: 11, color: "#999", margin: "8px 0 0" }}>Auto-added: id (bigserial), org_id, created_at</p>
        </div>

        {error && <p style={{ color: "#e53e3e", margin: "0 0 12px", fontSize: 13 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving} style={btnBlue}>{saving ? "Creating..." : "Create Table"}</button>
          <Link href="/-/databases" style={btnGrayLink}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, color: "#555" };
const inputStyle = { display: "block", width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, marginTop: 4, boxSizing: "border-box" };
const btnBlue = { padding: "8px 20px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnGrayLink = { padding: "8px 20px", background: "#666", color: "#fff", borderRadius: 4, fontSize: 13, textDecoration: "none", display: "inline-block" };
