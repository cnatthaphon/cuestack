"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "../../../../../lib/user-context.js";

export default function NewRolePage() {
  const { user } = useUser();
  const router = useRouter();
  const [permissions, setPermissions] = useState([]);
  const [form, setForm] = useState({ name: "", description: "" });
  const [selectedPerms, setSelectedPerms] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/permissions").then((r) => r.ok ? r.json() : { permissions: [] }).then((d) => setPermissions(d.permissions || []));
  }, []);

  const grouped = permissions.reduce((acc, p) => {
    const cat = p.category || p.id.split(".")[0] || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const togglePerm = (permId) => {
    setSelectedPerms((prev) =>
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]
    );
  };

  const toggleCategory = (perms) => {
    const ids = perms.map((p) => p.id);
    const allSelected = ids.every((id) => selectedPerms.includes(id));
    if (allSelected) {
      setSelectedPerms((prev) => prev.filter((p) => !ids.includes(p)));
    } else {
      setSelectedPerms((prev) => [...new Set([...prev, ...ids])]);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    if (!form.name) { setError("Name is required"); setSaving(false); return; }

    const res = await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, description: form.description, permissions: selectedPerms }),
    });

    if (!res.ok) {
      setError((await res.json()).error);
      setSaving(false);
      return;
    }

    router.push("/-/roles");
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/-/roles" style={{ color: "#666", textDecoration: "none", fontSize: 13 }}>&larr; Roles</Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>New Role</h1>
      </div>

      <form onSubmit={create} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 24 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <label style={labelStyle}>Name *
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={inputStyle} />
          </label>
          <label style={labelStyle}>Description
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inputStyle} />
          </label>
        </div>

        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Permissions</h2>
        <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px" }}>Select permissions for this role.</p>

        {Object.entries(grouped).map(([category, perms]) => {
          const allSelected = perms.every((p) => selectedPerms.includes(p.id));
          const someSelected = perms.some((p) => selectedPerms.includes(p.id));
          return (
            <div key={category} style={{ marginBottom: 16, padding: 12, background: "#f9fafb", borderRadius: 6, border: "1px solid #eee" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={() => toggleCategory(perms)}
                />
                <strong style={{ fontSize: 13, textTransform: "capitalize" }}>{category}</strong>
                <span style={{ fontSize: 11, color: "#999" }}>({perms.length})</span>
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 24 }}>
                {perms.map((p) => (
                  <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={selectedPerms.includes(p.id)} onChange={() => togglePerm(p.id)} />
                    {p.label || p.id}
                  </label>
                ))}
              </div>
            </div>
          );
        })}

        {error && <p style={{ color: "#e53e3e", margin: "0 0 12px", fontSize: 13 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving} style={btnBlue}>{saving ? "Creating..." : "Create Role"}</button>
          <Link href="/-/roles" style={btnGrayLink}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, color: "#555" };
const inputStyle = { display: "block", width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, marginTop: 4, boxSizing: "border-box" };
const btnBlue = { padding: "8px 20px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnGrayLink = { padding: "8px 20px", background: "#666", color: "#fff", borderRadius: 4, fontSize: 13, textDecoration: "none", display: "inline-block" };
