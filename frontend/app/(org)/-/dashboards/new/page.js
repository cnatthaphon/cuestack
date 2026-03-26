"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "../../../../../lib/user-context.js";

export default function NewDashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", slug: "", description: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    if (!form.name) { setError("Dashboard name is required"); setSaving(false); return; }

    const res = await fetch("/api/dashboards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      setError((await res.json()).error);
      setSaving(false);
      return;
    }

    const data = await res.json();
    const id = data.dashboard?.id || data.id;
    router.push(`/-/dashboards/${id}/edit`);
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/-/dashboards" style={{ color: "#666", textDecoration: "none", fontSize: 13 }}>&larr; Dashboards</Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>New Dashboard</h1>
      </div>

      <form onSubmit={create} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 24 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>Dashboard Settings</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <label style={labelStyle}>Name *
            <input value={form.name} onChange={(e) => {
              const name = e.target.value;
              const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-/, "");
              setForm({ ...form, name, slug });
            }} required style={inputStyle} />
          </label>
          <label style={labelStyle}>Slug
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
              placeholder="auto-generated" style={inputStyle} />
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>Description
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inputStyle} />
          </label>
        </div>

        {error && <p style={{ color: "#e53e3e", margin: "0 0 12px", fontSize: 13 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving} style={btnBlue}>{saving ? "Creating..." : "Create Dashboard"}</button>
          <Link href="/-/dashboards" style={btnGrayLink}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, color: "#555" };
const inputStyle = { display: "block", width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, marginTop: 4, boxSizing: "border-box" };
const btnBlue = { padding: "8px 20px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnGrayLink = { padding: "8px 20px", background: "#666", color: "#fff", borderRadius: 4, fontSize: 13, textDecoration: "none", display: "inline-block" };
