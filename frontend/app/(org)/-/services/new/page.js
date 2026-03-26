"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "../../../../../lib/user-context.js";

export default function NewServicePage() {
  const { user } = useUser();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", description: "", entrypoint: "main.py" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    if (!form.name) { setError("Service name is required"); setSaving(false); return; }

    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      setError((await res.json()).error);
      setSaving(false);
      return;
    }

    router.push("/-/services");
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/-/services" style={{ color: "#666", textDecoration: "none", fontSize: 13 }}>&larr; Services</Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>New Service</h1>
      </div>

      <form onSubmit={create} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 24 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>Service Settings</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <label style={labelStyle}>Service Name *
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
              required placeholder="my-service" style={inputStyle} />
          </label>
          <label style={labelStyle}>Entrypoint
            <input value={form.entrypoint} onChange={(e) => setForm({ ...form, entrypoint: e.target.value })}
              placeholder="main.py" style={inputStyle} />
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>Description
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inputStyle} />
          </label>
        </div>

        <div style={{ padding: 12, background: "#f0f7ff", borderRadius: 6, border: "1px solid #cce0ff", marginBottom: 16, fontSize: 12, color: "#333" }}>
          <strong>How it works:</strong><br />
          1. Create a service with a Python entrypoint file<br />
          2. Upload your Python code to <code>/files/services/{form.name || "your-service"}/</code><br />
          3. Start the service — it runs as a FastAPI process<br />
          4. Access your API at <code>/api/v1/services/{form.name || "your-service"}/</code>
        </div>

        {error && <p style={{ color: "#e53e3e", margin: "0 0 12px", fontSize: 13 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving} style={btnBlue}>{saving ? "Creating..." : "Create Service"}</button>
          <Link href="/-/services" style={btnGrayLink}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, color: "#555" };
const inputStyle = { display: "block", width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, marginTop: 4, boxSizing: "border-box" };
const btnBlue = { padding: "8px 20px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnGrayLink = { padding: "8px 20px", background: "#666", color: "#fff", borderRadius: 4, fontSize: 13, textDecoration: "none", display: "inline-block" };
