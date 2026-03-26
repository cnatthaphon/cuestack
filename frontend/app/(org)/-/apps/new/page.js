"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "../../../../../lib/user-context.js";

const APP_TYPES = [
  { id: "html", label: "HTML / JS", icon: "\u{1F310}", desc: "Static web app with HTML, CSS, and JavaScript" },
  { id: "dash", label: "Dash (Python)", icon: "\u{1F4CA}", desc: "Python Dash dashboard application" },
  { id: "visual", label: "Visual Flow", icon: "\u{1F9E9}", desc: "Block-based visual programming editor" },
];

export default function NewAppPage() {
  const { user } = useUser();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", slug: "", description: "", app_type: "html", icon: "\u{1F4F1}" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    if (!form.name) { setError("App name is required"); setSaving(false); return; }

    const res = await fetch("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      setError((await res.json()).error);
      setSaving(false);
      return;
    }

    router.push("/-/apps");
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/-/apps" style={{ color: "#666", textDecoration: "none", fontSize: 13 }}>&larr; Apps</Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>New App</h1>
      </div>

      <form onSubmit={create} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 24 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>App Type</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {APP_TYPES.map((t) => (
            <button key={t.id} type="button" onClick={() => setForm({ ...form, app_type: t.id })}
              style={{
                flex: 1, padding: 16, borderRadius: 8, cursor: "pointer", textAlign: "center",
                border: form.app_type === t.id ? "2px solid #0070f3" : "1px solid #ddd",
                background: form.app_type === t.id ? "#e8f4ff" : "#fff",
              }}>
              <div style={{ fontSize: 28 }}>{t.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{t.label}</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{t.desc}</div>
            </button>
          ))}
        </div>

        <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>App Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <label style={labelStyle}>App Name *
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
          <label style={labelStyle}>Icon
            <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })}
              style={{ ...inputStyle, width: 60, textAlign: "center" }} />
          </label>
          <label style={labelStyle}>Description
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inputStyle} />
          </label>
        </div>

        {error && <p style={{ color: "#e53e3e", margin: "0 0 12px", fontSize: 13 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving} style={btnBlue}>{saving ? "Creating..." : "Create App"}</button>
          <Link href="/-/apps" style={btnGrayLink}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, color: "#555" };
const inputStyle = { display: "block", width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, marginTop: 4, boxSizing: "border-box" };
const btnBlue = { padding: "8px 20px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnGrayLink = { padding: "8px 20px", background: "#666", color: "#fff", borderRadius: 4, fontSize: 13, textDecoration: "none", display: "inline-block" };
