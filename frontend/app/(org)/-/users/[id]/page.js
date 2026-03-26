"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "../../../../../lib/user-context.js";

export default function UserDetailPage() {
  const { user: currentUser, hasPermission } = useUser();
  const params = useParams();
  const router = useRouter();
  const [userDetail, setUserDetail] = useState(null);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({});
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/users/${params.id}`).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.user) {
        setUserDetail(d.user);
        setForm({
          first_name: d.user.first_name || "",
          last_name: d.user.last_name || "",
          display_name: d.user.display_name || "",
          email: d.user.email || "",
          phone: d.user.phone || "",
          department: d.user.department || "",
        });
        setSelectedRoles(d.user.roles?.map((r) => r.id) || []);
      }
    });
    fetch("/api/roles").then((r) => r.ok ? r.json() : { roles: [] }).then((d) => setRoles(d.roles || []));
  }, [params.id]);

  const canEdit = hasPermission("users.edit");

  const save = async () => {
    setSaving(true);
    setMessage("");
    const body = { ...form, role_ids: selectedRoles };
    if (newPassword) body.password = newPassword;

    const res = await fetch(`/api/users/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setMessage("Saved");
      setNewPassword("");
    } else {
      setMessage((await res.json()).error);
    }
    setSaving(false);
  };

  const toggleRole = (roleId) => {
    setSelectedRoles((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]
    );
  };

  if (!currentUser || !userDetail) return <div style={{ padding: 32, color: "#666" }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/-/users" style={{ color: "#666", textDecoration: "none", fontSize: 13 }}>&larr; Users</Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>{userDetail.username}</h1>
      </div>

      <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 24 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>Profile</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <label style={labelStyle}>First Name
            <input value={form.first_name || ""} onChange={(e) => setForm({ ...form, first_name: e.target.value })} disabled={!canEdit} style={inputStyle} />
          </label>
          <label style={labelStyle}>Last Name
            <input value={form.last_name || ""} onChange={(e) => setForm({ ...form, last_name: e.target.value })} disabled={!canEdit} style={inputStyle} />
          </label>
          <label style={labelStyle}>Display Name
            <input value={form.display_name || ""} onChange={(e) => setForm({ ...form, display_name: e.target.value })} disabled={!canEdit} style={inputStyle} />
          </label>
          <label style={labelStyle}>Department
            <input value={form.department || ""} onChange={(e) => setForm({ ...form, department: e.target.value })} disabled={!canEdit} style={inputStyle} />
          </label>
          <label style={labelStyle}>Email
            <input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!canEdit} style={inputStyle} />
          </label>
          <label style={labelStyle}>Phone
            <input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!canEdit} style={inputStyle} />
          </label>
        </div>

        {canEdit && (
          <label style={labelStyle}>Reset Password
            <input type="password" placeholder="New password (min 8, leave blank to keep)" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} autoComplete="new-password" />
          </label>
        )}

        <h2 style={{ margin: "24px 0 12px", fontSize: 16 }}>Roles</h2>
        <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px" }}>
          Assign multiple roles. Permissions are the union of all selected roles.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {roles.map((role) => {
            const selected = selectedRoles.includes(role.id);
            return (
              <button key={role.id} onClick={() => canEdit && toggleRole(role.id)} disabled={!canEdit}
                style={{
                  padding: "6px 14px", borderRadius: 6, fontSize: 13, cursor: canEdit ? "pointer" : "default",
                  background: selected ? "#0070f3" : "#f7f7f7",
                  color: selected ? "#fff" : "#333",
                  border: selected ? "1px solid #0070f3" : "1px solid #ddd",
                  fontWeight: selected ? 600 : 400,
                }}>
                {role.name}
                {selected && " \u2713"}
              </button>
            );
          })}
        </div>

        {selectedRoles.length > 0 && (
          <div style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>
            <strong>Effective permissions:</strong>{" "}
            {roles.filter((r) => selectedRoles.includes(r.id)).flatMap((r) => r.permissions || []).filter((p, i, arr) => arr.indexOf(p) === i).length} unique permissions from {selectedRoles.length} role(s)
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {canEdit && (
            <button onClick={save} disabled={saving} style={btnBlue}>{saving ? "Saving..." : "Save Changes"}</button>
          )}
          <Link href="/-/users" style={btnGray}>Back</Link>
          {message && <span style={{ fontSize: 13, color: message === "Saved" ? "#38a169" : "#e53e3e" }}>{message}</span>}
        </div>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #eee", fontSize: 12, color: "#999" }}>
          ID: {userDetail.id} &middot; Created: {new Date(userDetail.created_at).toLocaleString()}
          {userDetail.updated_at && <span> &middot; Updated: {new Date(userDetail.updated_at).toLocaleString()}</span>}
        </div>
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, color: "#555", marginBottom: 4 };
const inputStyle = { display: "block", width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, marginTop: 4, boxSizing: "border-box" };
const btnBlue = { padding: "8px 20px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnGray = { padding: "8px 20px", background: "#666", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, textDecoration: "none" };
