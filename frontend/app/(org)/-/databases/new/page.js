"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "../../../../../lib/user-context.js";

const COL_TYPES = [
  { value: "text", label: "Text (VARCHAR)" },
  { value: "long_text", label: "Long Text" },
  { value: "integer", label: "Integer" },
  { value: "bigint", label: "Big Integer" },
  { value: "float", label: "Float (Double)" },
  { value: "boolean", label: "Boolean" },
  { value: "timestamp", label: "Timestamp" },
  { value: "date", label: "Date" },
  { value: "json", label: "JSON" },
  { value: "uuid", label: "UUID" },
];

const DEFAULT_COL = { name: "", type: "text", nullable: true, unique: false, indexed: false, default_value: "" };

export default function NewDatabasePage() {
  const { user } = useUser();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", db_type: "analytical", description: "" });
  const [columns, setColumns] = useState([{ ...DEFAULT_COL }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const addColumn = () => setColumns([...columns, { ...DEFAULT_COL }]);
  const removeColumn = (idx) => setColumns(columns.filter((_, i) => i !== idx));
  const updateColumn = (idx, field, value) => {
    setColumns(columns.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const create = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    if (!form.name) { setError("Table name is required"); setSaving(false); return; }

    const cols = columns.map((c) => ({
      name: c.name.toLowerCase().replace(/[^a-z0-9_]/g, ""),
      type: c.type,
      nullable: c.nullable,
      unique: c.unique,
      indexed: c.indexed,
      default_value: c.default_value || undefined,
    })).filter((c) => c.name);

    if (cols.length === 0) { setError("At least one column required"); setSaving(false); return; }

    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, columns: cols }),
    });

    if (!res.ok) { setError((await res.json()).error); setSaving(false); return; }
    router.push("/-/databases");
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/-/databases" style={{ color: "#666", textDecoration: "none", fontSize: 13 }}>&larr; Databases</Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>New Table</h1>
      </div>

      <form onSubmit={create} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 24 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>Table Settings</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <label style={labelStyle}>Table Name *
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
              required placeholder="lowercase_name" style={inputStyle} />
          </label>
          <label style={labelStyle}>Database Type
            <select value={form.db_type} onChange={(e) => setForm({ ...form, db_type: e.target.value })} style={inputStyle}>
              <option value="analytical">Analytical</option>
              <option value="transactional">Transactional</option>
            </select>
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>Description
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inputStyle} />
          </label>
        </div>

        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Columns</h2>

        {/* Column header */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 140px 60px 60px 60px 140px 30px", gap: 6, padding: "0 0 6px", fontSize: 11, color: "#666", fontWeight: 600 }}>
          <span>Name</span><span>Type</span><span style={thCenter}>Null</span><span style={thCenter}>Unique</span><span style={thCenter}>Index</span><span>Default</span><span></span>
        </div>

        <div style={{ padding: 12, background: "#f9fafb", borderRadius: 6, border: "1px solid #eee", marginBottom: 16 }}>
          {columns.map((col, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 140px 60px 60px 60px 140px 30px", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <input placeholder="column_name" value={col.name}
                onChange={(e) => updateColumn(i, "name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                style={inputStyle} />
              <select value={col.type} onChange={(e) => updateColumn(i, "type", e.target.value)} style={inputStyle}>
                {COL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <div style={{ textAlign: "center" }}>
                <input type="checkbox" checked={col.nullable} onChange={(e) => updateColumn(i, "nullable", e.target.checked)} title="Nullable" />
              </div>
              <div style={{ textAlign: "center" }}>
                <input type="checkbox" checked={col.unique} onChange={(e) => updateColumn(i, "unique", e.target.checked)} title="Unique constraint" />
              </div>
              <div style={{ textAlign: "center" }}>
                <input type="checkbox" checked={col.indexed} onChange={(e) => updateColumn(i, "indexed", e.target.checked)} title="Create index" />
              </div>
              <input placeholder="default" value={col.default_value}
                onChange={(e) => updateColumn(i, "default_value", e.target.value)}
                style={inputStyle} />
              {columns.length > 1 && (
                <button type="button" onClick={() => removeColumn(i)} style={{ background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 14 }}>x</button>
              )}
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <button type="button" onClick={addColumn} style={btnSmall}>+ Add Column</button>
            <span style={{ fontSize: 11, color: "#999" }}>Auto-added: id (bigserial PK), org_id, created_at</span>
          </div>
        </div>

        {/* Default value hints */}
        <div style={{ marginBottom: 16, padding: 12, background: "#fffbeb", borderRadius: 6, border: "1px solid #fef3c7", fontSize: 12, color: "#92400e" }}>
          <strong>Default value hints:</strong> For timestamps use <code>now</code>. For booleans use <code>true</code> or <code>false</code>. Numbers as-is. Text in plain form (no quotes needed).
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
const inputStyle = { display: "block", width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, marginTop: 2, boxSizing: "border-box" };
const btnBlue = { padding: "8px 20px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnGrayLink = { padding: "8px 20px", background: "#666", color: "#fff", borderRadius: 4, fontSize: 13, textDecoration: "none", display: "inline-block" };
const btnSmall = { padding: "4px 12px", background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const thCenter = { textAlign: "center" };
