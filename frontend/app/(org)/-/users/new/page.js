"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "../../../../../lib/user-context.js";

export default function NewUserPage() {
  const { user } = useUser();
  const router = useRouter();
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({
    username: "", password: "", first_name: "", last_name: "",
    email: "", phone: "", department: "",
  });
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/roles").then((r) => r.ok ? r.json() : { roles: [] }).then((d) => setRoles(d.roles || []));
  }, []);

  const toggleRole = (roleId) => {
    setSelectedRoles((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]
    );
  };

  const create = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    if (!form.username || !form.password) { setError("Username and password required"); setSaving(false); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); setSaving(false); return; }
    if (selectedRoles.length === 0) { setError("Select at least one role"); setSaving(false); return; }

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, role_ids: selectedRoles }),
    });

    if (!res.ok) {
      setError((await res.json()).error);
      setSaving(false);
      return;
    }

    const data = await res.json();
    router.push(`/-/users/${data.user.id}`);
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/-/users" style={{ color: "#666", textDecoration: "none", fontSize: 13 }}>&larr; Users</Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>New User</h1>
      </div>

      <form onSubmit={create} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 24 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>Account</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <label style={labelStyle}>Username *
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required style={inputStyle} autoComplete="off" />
          </label>
          <label style={labelStyle}>Password *
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required style={inputStyle} autoComplete="new-password" />
          </label>
        </div>

        <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>Profile</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <label style={labelStyle}>First Name
            <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Last Name
            <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Email
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>Phone
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
          </label>
          <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>Department
            <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} style={inputStyle} />
          </label>
        </div>

        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Roles *</h2>
        <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px" }}>Select one or more roles. Permissions will be the union.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {roles.map((role) => {
            const selected = selectedRoles.includes(role.id);
            return (
              <button key={role.id} type="button" onClick={() => toggleRole(role.id)}
                style={{
                  padding: "6px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
                  background: selected ? "#0070f3" : "#f7f7f7",
                  color: selected ? "#fff" : "#333",
                  border: selected ? "1px solid #0070f3" : "1px solid #ddd",
                  fontWeight: selected ? 600 : 400,
                }}>
                {role.name} {selected && "\u2713"}
              </button>
            );
          })}
        </div>

        {error && <p style={{ color: "#e53e3e", margin: "0 0 12px", fontSize: 13 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving} style={btnBlue}>{saving ? "Creating..." : "Create User"}</button>
          <Link href="/-/users" style={btnGrayLink}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, color: "#555" };
const inputStyle = { display: "block", width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, marginTop: 4, boxSizing: "border-box" };
const btnBlue = { padding: "8px 20px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnGrayLink = { padding: "8px 20px", background: "#666", color: "#fff", borderRadius: 4, fontSize: 13, textDecoration: "none", display: "inline-block" };
