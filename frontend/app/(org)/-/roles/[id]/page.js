"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "../../../../../lib/user-context.js";

export default function RoleDetailPage() {
  const { user, hasPermission } = useUser();
  const params = useParams();
  const router = useRouter();
  const [role, setRole] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [selectedPerms, setSelectedPerms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/roles").then((r) => r.ok ? r.json() : { roles: [] }).then((d) => {
      const found = (d.roles || []).find((r) => String(r.id) === String(params.id));
      if (found) {
        setRole(found);
        setSelectedPerms(found.permissions || []);
      }
    });
    fetch("/api/permissions").then((r) => r.ok ? r.json() : { permissions: [] }).then((d) => setPermissions(d.permissions || []));
  }, [params.id]);

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

  const save = async () => {
    setSaving(true);
    setMessage("");
    const res = await fetch(`/api/roles/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: selectedPerms }),
    });
    if (res.ok) {
      setMessage("Saved");
    } else {
      setMessage((await res.json()).error);
    }
    setSaving(false);
  };

  const deleteRole = async () => {
    if (!confirm(`Delete role "${role.name}"? Users with this role will lose its permissions.`)) return;
    const res = await fetch(`/api/roles/${params.id}`, { method: "DELETE" });
    if (res.ok) router.push("/-/roles");
  };

  if (!user || !role) return <div style={{ padding: 32, color: "#666" }}>Loading...</div>;

  const canEdit = hasPermission("roles.edit");

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href="/-/roles" style={{ color: "#666", textDecoration: "none", fontSize: 13 }}>&larr; Roles</Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>
          {role.name}
          {role.is_default && (
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#f0f0f0", color: "#666", marginLeft: 8, fontWeight: 400 }}>default</span>
          )}
        </h1>
      </div>

      <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 24 }}>
        <div style={{ display: "flex", gap: 24, marginBottom: 16, fontSize: 13, color: "#666" }}>
          {role.description && <span>{role.description}</span>}
          <span>{role.user_count || 0} user(s)</span>
          <span>{selectedPerms.length} permission(s)</span>
        </div>

        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Permissions</h2>

        {Object.entries(grouped).map(([category, perms]) => {
          const allSelected = perms.every((p) => selectedPerms.includes(p.id));
          const someSelected = perms.some((p) => selectedPerms.includes(p.id));
          return (
            <div key={category} style={{ marginBottom: 16, padding: 12, background: "#f9fafb", borderRadius: 6, border: "1px solid #eee" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: canEdit ? "pointer" : "default", marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={() => canEdit && toggleCategory(perms)}
                  disabled={!canEdit}
                />
                <strong style={{ fontSize: 13, textTransform: "capitalize" }}>{category}</strong>
                <span style={{ fontSize: 11, color: "#999" }}>({perms.length})</span>
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 24 }}>
                {perms.map((p) => (
                  <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: canEdit ? "pointer" : "default" }}>
                    <input type="checkbox" checked={selectedPerms.includes(p.id)} onChange={() => canEdit && togglePerm(p.id)} disabled={!canEdit} />
                    {p.label || p.id}
                  </label>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {canEdit && (
            <button onClick={save} disabled={saving} style={btnBlue}>{saving ? "Saving..." : "Save Changes"}</button>
          )}
          <Link href="/-/roles" style={btnGray}>Back</Link>
          {canEdit && (
            <button onClick={deleteRole} style={btnDanger}>Delete Role</button>
          )}
          {message && <span style={{ fontSize: 13, color: message === "Saved" ? "#38a169" : "#e53e3e" }}>{message}</span>}
        </div>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #eee", fontSize: 12, color: "#999" }}>
          ID: {role.id}
        </div>
      </div>
    </div>
  );
}

const btnBlue = { padding: "8px 20px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnGray = { padding: "8px 20px", background: "#666", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, textDecoration: "none" };
const btnDanger = { padding: "8px 20px", background: "#e53e3e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
