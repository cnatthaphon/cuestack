"use client";

import { useEffect, useState, useRef } from "react";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { DateTimeCell } from "../../../../lib/components/data-table.js";

const VIEWS = [
  { id: "my", label: "My Files", icon: "\u{1F4C1}" },
  { id: "shared", label: "Shared with me", icon: "\u{1F465}" },
  { id: "org", label: "Org Files", icon: "\u{1F3E2}" },
];

export default function FilesPage() {
  const { user, hasPermission } = useUser();
  const [files, setFiles] = useState([]);
  const [storage, setStorage] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [parentId, setParentId] = useState(null);
  const [view, setView] = useState("my");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [sharingEntry, setSharingEntry] = useState(null);
  const [shareInput, setShareInput] = useState("");
  const [orgUsers, setOrgUsers] = useState([]);
  const [dragOverId, setDragOverId] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { loadFiles("my", null); loadOrgUsers(); }, []);

  const loadFiles = async (v, pid) => {
    const params = new URLSearchParams({ view: v });
    if (pid) params.set("parent", pid);
    const res = await fetch(`/api/files?${params}`);
    if (res.ok) {
      const d = await res.json();
      setFiles(d.files || []);
      setStorage(d.storage);
      setBreadcrumb(d.breadcrumb || []);
      setParentId(pid);
      setView(v);
    }
  };

  const loadOrgUsers = async () => {
    const res = await fetch("/api/users");
    if (res.ok) { const d = await res.json(); setOrgUsers(d.users || []); }
  };

  const switchView = (v) => { loadFiles(v, null); setError(""); setRenamingId(null); setShowNewFolder(false); setSharingEntry(null); };
  const navigateTo = (id) => { loadFiles(view, id); setError(""); setRenamingId(null); };
  const goUp = () => breadcrumb.length > 1 ? navigateTo(breadcrumb[breadcrumb.length - 2].id) : navigateTo(null);

  const uploadFiles = async (fileList) => {
    setUploading(true); setError("");
    for (const file of fileList) {
      const formData = new FormData();
      formData.append("file", file);
      if (parentId) formData.append("parent_id", parentId);
      formData.append("visibility", view === "org" ? "org" : "private");
      const res = await fetch("/api/files", { method: "POST", body: formData });
      if (!res.ok) { setError((await res.json()).error); break; }
    }
    setUploading(false); loadFiles(view, parentId);
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const res = await fetch("/api/files", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mkdir", name: newFolderName, parent_id: parentId, visibility: view === "org" ? "org" : "private" }),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setNewFolderName(""); setShowNewFolder(false); loadFiles(view, parentId);
  };

  const doRename = async () => {
    if (!renameValue.trim() || !renamingId) return;
    await fetch("/api/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rename", id: renamingId, name: renameValue }) });
    setRenamingId(null); loadFiles(view, parentId);
  };

  const deleteItem = async (id, name) => { if (!confirm(`Delete "${name}"?`)) return; await fetch(`/api/files?id=${id}`, { method: "DELETE" }); loadFiles(view, parentId); };
  const downloadItem = (id) => window.open(`/api/files/download?id=${id}`, "_blank");

  const handleDrop = async (e, targetId) => {
    e.preventDefault(); setDragOverId(null);
    const entryId = e.dataTransfer.getData("entry_id");
    if (!entryId || entryId === targetId) return;
    await fetch("/api/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "move", id: entryId, parent_id: targetId }) });
    loadFiles(view, parentId);
  };

  // Share dialog
  const openShare = (entry) => { setSharingEntry(entry); setShareInput(""); };
  const doShare = async (shareWith) => {
    await fetch("/api/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "share", id: sharingEntry.id, share_with: shareWith }) });
    setSharingEntry(null); loadFiles(view, parentId);
  };
  const setVis = async (id, visibility) => {
    await fetch("/api/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_visibility", id, visibility }) });
    loadFiles(view, parentId);
  };

  if (!user) return null;
  const isOwnerView = view === "my";
  const formatSize = (b) => { if (!b) return "\u2014"; if (b < 1024) return `${b} B`; if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`; return `${(b / 1048576).toFixed(1)} MB`; };

  const columns = [
    { key: "name", label: "Name", render: (v, row) => {
      if (renamingId === row.id) return (
        <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={doRename}
          onKeyDown={(e) => { if (e.key === "Enter") doRename(); if (e.key === "Escape") setRenamingId(null); }}
          autoFocus style={{ padding: 4, border: "1px solid #0070f3", borderRadius: 4, fontSize: 13, width: 200 }} />
      );
      const icon = row.entry_type === "directory" ? "\u{1F4C1}" : "\u{1F4C4}";
      return (
        <div draggable={isOwnerView} onDragStart={(e) => { e.dataTransfer.setData("entry_id", row.id); }}
          onDragOver={(e) => { if (row.entry_type === "directory") { e.preventDefault(); setDragOverId(row.id); } }}
          onDragLeave={() => setDragOverId(null)} onDrop={(e) => row.entry_type === "directory" && handleDrop(e, row.id)}
          onClick={() => row.entry_type === "directory" && navigateTo(row.id)}
          style={{ cursor: row.entry_type === "directory" ? "pointer" : "default", background: dragOverId === row.id ? "#e8f4ff" : "transparent", padding: "2px 4px", borderRadius: 4 }}>
          {icon} {v}
        </div>
      );
    }},
    ...(view !== "my" ? [{ key: "owner_name", label: "Owner", width: 100 }] : []),
    { key: "visibility", label: "Visibility", width: 90, render: (v) => {
      const colors = { private: "#666", org: "#0070f3", public: "#38a169" };
      return <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: `${colors[v] || "#666"}15`, color: colors[v] || "#666" }}>{v}</span>;
    }},
    { key: "size", label: "Size", width: 90, render: (v, row) => row.entry_type === "file" ? formatSize(v) : "\u2014" },
    { key: "updated_at", label: "Modified", render: (v) => <DateTimeCell value={v} /> },
  ];

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Files</h1>
        {storage && (
          <div style={{ fontSize: 13, color: "#666" }}>
            {storage.used_mb} MB / {storage.limit_mb} MB
            <div style={{ width: 120, height: 6, background: "#e2e8f0", borderRadius: 3, marginTop: 4 }}>
              <div style={{ width: `${Math.min(storage.percent, 100)}%`, height: "100%", background: storage.percent > 80 ? "#e53e3e" : "#0070f3", borderRadius: 3 }} />
            </div>
          </div>
        )}
      </div>

      {/* View tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, borderBottom: "2px solid #e2e8f0" }}>
        {VIEWS.map((v) => (
          <button key={v.id} onClick={() => switchView(v.id)} style={{
            padding: "8px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
            background: view === v.id ? "#0070f3" : "transparent", color: view === v.id ? "#fff" : "#666",
            borderRadius: "6px 6px 0 0",
          }}>
            {v.icon} {v.label}
          </button>
        ))}
      </div>

      {/* Breadcrumb */}
      {view !== "shared" && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 12, fontSize: 13 }}>
          <button onClick={() => navigateTo(null)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, null)}
            style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", padding: 0, fontSize: 13 }}>Home</button>
          {breadcrumb.map((c) => (
            <span key={c.id}>
              <span style={{ color: "#999", margin: "0 4px" }}>/</span>
              <button onClick={() => navigateTo(c.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, c.id)}
                style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", padding: 0, fontSize: 13 }}>{c.name}</button>
            </span>
          ))}
        </div>
      )}

      {showNewFolder && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <input placeholder="Folder name" value={newFolderName} autoFocus onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createFolder()} style={inputStyle} />
          <button onClick={createFolder} style={btnBlue}>Create</button>
          <button onClick={() => setShowNewFolder(false)} style={btnGray}>Cancel</button>
        </div>
      )}
      {error && <p style={{ color: "#e53e3e", margin: "0 0 12px", fontSize: 13 }}>{error}</p>}

      {/* Share dialog */}
      {sharingEntry && (
        <div style={{ marginBottom: 12, padding: 16, background: "#fff", borderRadius: 8, border: "2px solid #0070f3" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Share: {sharingEntry.name}</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => setVis(sharingEntry.id, "private")} style={{ ...visBtn, ...(sharingEntry.visibility === "private" ? visBtnActive : {}) }}>Private</button>
            <button onClick={() => setVis(sharingEntry.id, "org")} style={{ ...visBtn, ...(sharingEntry.visibility === "org" ? visBtnActive : {}) }}>Org (everyone)</button>
            <button onClick={() => setVis(sharingEntry.id, "public")} style={{ ...visBtn, ...(sharingEntry.visibility === "public" ? visBtnActive : {}) }}>Public link</button>
          </div>
          <p style={{ fontSize: 12, color: "#666", margin: "0 0 8px" }}>Share with specific users:</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
            {orgUsers.filter((u) => u.id !== user.id).map((u) => {
              const isShared = (sharingEntry.shared_with || []).some((s) => s.type === "user" && s.id === u.id);
              return (
                <button key={u.id} onClick={() => {
                  const current = sharingEntry.shared_with || [];
                  const next = isShared ? current.filter((s) => !(s.type === "user" && s.id === u.id)) : [...current, { type: "user", id: u.id }];
                  doShare(next);
                  setSharingEntry({ ...sharingEntry, shared_with: next });
                }} style={{
                  padding: "4px 10px", borderRadius: 4, fontSize: 12, cursor: "pointer",
                  background: isShared ? "#e8f4ff" : "#f7f7f7", border: isShared ? "1px solid #0070f3" : "1px solid #ddd",
                  color: isShared ? "#0070f3" : "#666",
                }}>
                  {u.username} {isShared ? "\u2713" : ""}
                </button>
              );
            })}
          </div>
          <button onClick={() => setSharingEntry(null)} style={btnGray}>Done</button>
        </div>
      )}

      <DataTable columns={columns} data={files} searchKeys={["name"]}
        bulkActions={isOwnerView && hasPermission("files.delete") ? [
          { label: "Delete Selected", onClick: async (ids) => { if (!confirm(`Delete ${ids.length} items?`)) return; for (const id of ids) await fetch(`/api/files?id=${id}`, { method: "DELETE" }); loadFiles(view, parentId); }, color: "#e53e3e" },
        ] : undefined}
        actions={(row) => (
          <div style={{ display: "flex", gap: 4 }}>
            {row.entry_type === "file" && <button onClick={() => downloadItem(row.id)} style={btnLink}>Download</button>}
            {row.created_by === user.id && <button onClick={() => openShare(row)} style={btnLink}>Share</button>}
            {row.created_by === user.id && <button onClick={() => { setRenamingId(row.id); setRenameValue(row.name); }} style={btnLink}>Rename</button>}
            {row.created_by === user.id && <button onClick={() => deleteItem(row.id, row.name)} style={btnDanger}>Delete</button>}
          </div>
        )}
        toolbar={
          <div style={{ display: "flex", gap: 8 }}>
            {parentId && view !== "shared" && <button onClick={goUp} style={btnGray}>&larr; Up</button>}
            {(isOwnerView || view === "org") && hasPermission("files.upload") && (
              <>
                <input type="file" ref={fileInputRef} multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files.length) uploadFiles(e.target.files); }} />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={btnBlue}>{uploading ? "Uploading..." : "Upload"}</button>
                <button onClick={() => setShowNewFolder(true)} style={btnGray}>New Folder</button>
              </>
            )}
          </div>
        }
        emptyMessage={view === "shared" ? "No files shared with you yet" : "Empty — upload files or create a folder"}
      />
      <p style={{ fontSize: 11, color: "#999", marginTop: 8 }}>Drag items onto folders to move. Only file owners can rename, move, share, or delete.</p>
    </div>
  );
}

const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, flex: 1 };
const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const btnGray = { padding: "8px 16px", background: "#666", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const btnLink = { background: "none", border: "none", color: "#0070f3", cursor: "pointer", fontSize: 12, padding: "2px 4px" };
const btnDanger = { background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12, padding: "2px 4px" };
const visBtn = { padding: "6px 12px", background: "#f7f7f7", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const visBtnActive = { background: "#e8f4ff", borderColor: "#0070f3", color: "#0070f3" };
