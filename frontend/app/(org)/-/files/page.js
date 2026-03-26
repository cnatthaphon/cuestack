"use client";

import { useEffect, useState, useRef } from "react";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { DateTimeCell } from "../../../../lib/components/data-table.js";

export default function FilesPage() {
  const { user, hasPermission } = useUser();
  const [files, setFiles] = useState([]);
  const [storage, setStorage] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [parentId, setParentId] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dragOverId, setDragOverId] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { loadFiles(null); }, []);

  const loadFiles = async (pid) => {
    const url = pid ? `/api/files?parent=${pid}` : "/api/files";
    const res = await fetch(url);
    if (res.ok) {
      const d = await res.json();
      setFiles(d.files || []);
      setStorage(d.storage);
      setBreadcrumb(d.breadcrumb || []);
      setParentId(pid);
    }
  };

  const navigateTo = (id) => { loadFiles(id); setError(""); setRenamingId(null); setShowNewFolder(false); };
  const goUp = () => breadcrumb.length > 1 ? navigateTo(breadcrumb[breadcrumb.length - 2].id) : navigateTo(null);

  const uploadFiles = async (fileList) => {
    setUploading(true); setError("");
    for (const file of fileList) {
      const formData = new FormData();
      formData.append("file", file);
      if (parentId) formData.append("parent_id", parentId);
      const res = await fetch("/api/files", { method: "POST", body: formData });
      if (!res.ok) { setError((await res.json()).error); break; }
    }
    setUploading(false); loadFiles(parentId);
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    setError("");
    const res = await fetch("/api/files", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mkdir", name: newFolderName, parent_id: parentId }),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setNewFolderName(""); setShowNewFolder(false); loadFiles(parentId);
  };

  const startRename = (entry) => { setRenamingId(entry.id); setRenameValue(entry.name); };
  const doRename = async () => {
    if (!renameValue.trim() || !renamingId) return;
    await fetch("/api/files", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", id: renamingId, name: renameValue }),
    });
    setRenamingId(null); loadFiles(parentId);
  };

  const deleteItem = async (id, name) => { if (!confirm(`Delete "${name}"?`)) return; await fetch(`/api/files?id=${id}`, { method: "DELETE" }); loadFiles(parentId); };
  const downloadItem = (id) => window.open(`/api/files/download?id=${id}`, "_blank");

  // Drag and drop
  const handleDragStart = (e, entry) => { e.dataTransfer.setData("entry_id", entry.id); e.dataTransfer.effectAllowed = "move"; };
  const handleDrop = async (e, targetId) => {
    e.preventDefault(); setDragOverId(null);
    const entryId = e.dataTransfer.getData("entry_id");
    if (!entryId || entryId === targetId) return;
    await fetch("/api/files", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move", id: entryId, parent_id: targetId }),
    });
    loadFiles(parentId);
  };

  if (!user) return null;
  const formatSize = (bytes) => { if (!bytes) return "\u2014"; if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1048576).toFixed(1)} MB`; };

  const columns = [
    { key: "name", label: "Name", render: (v, row) => {
      if (renamingId === row.id) return (
        <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
          onBlur={doRename} onKeyDown={(e) => { if (e.key === "Enter") doRename(); if (e.key === "Escape") setRenamingId(null); }}
          autoFocus style={{ padding: 4, border: "1px solid #0070f3", borderRadius: 4, fontSize: 13, width: 200 }} />
      );
      const icon = row.entry_type === "directory" ? "\u{1F4C1}" : "\u{1F4C4}";
      return (
        <div draggable onDragStart={(e) => handleDragStart(e, row)}
          onDragOver={(e) => { if (row.entry_type === "directory") { e.preventDefault(); setDragOverId(row.id); } }}
          onDragLeave={() => setDragOverId(null)}
          onDrop={(e) => row.entry_type === "directory" && handleDrop(e, row.id)}
          onClick={() => row.entry_type === "directory" && navigateTo(row.id)}
          style={{ cursor: row.entry_type === "directory" ? "pointer" : "default", background: dragOverId === row.id ? "#e8f4ff" : "transparent", padding: "2px 4px", borderRadius: 4 }}>
          {icon} {v}
        </div>
      );
    }},
    { key: "size", label: "Size", width: 100, render: (v, row) => row.entry_type === "file" ? formatSize(v) : "\u2014" },
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

      {/* Breadcrumb */}
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

      {showNewFolder && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <input placeholder="Folder name" value={newFolderName} autoFocus onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createFolder()} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, flex: 1 }} />
          <button onClick={createFolder} style={btnBlue}>Create</button>
          <button onClick={() => setShowNewFolder(false)} style={btnGray}>Cancel</button>
        </div>
      )}
      {error && <p style={{ color: "#e53e3e", margin: "0 0 12px", fontSize: 13 }}>{error}</p>}

      <DataTable columns={columns} data={files} searchKeys={["name"]}
        bulkActions={hasPermission("files.delete") ? [
          { label: "Delete Selected", onClick: async (ids) => { if (!confirm(`Delete ${ids.length} items?`)) return; for (const id of ids) await fetch(`/api/files?id=${id}`, { method: "DELETE" }); loadFiles(parentId); }, color: "#e53e3e" },
        ] : undefined}
        actions={(row) => (
          <div style={{ display: "flex", gap: 4 }}>
            {row.entry_type === "file" && <button onClick={() => downloadItem(row.id)} style={btnLink}>Download</button>}
            {hasPermission("files.upload") && <button onClick={() => startRename(row)} style={btnLink}>Rename</button>}
            {hasPermission("files.delete") && <button onClick={() => deleteItem(row.id, row.name)} style={btnDanger}>Delete</button>}
          </div>
        )}
        toolbar={
          <div style={{ display: "flex", gap: 8 }}>
            {parentId && <button onClick={goUp} style={btnGray}>&larr; Up</button>}
            {hasPermission("files.upload") && (
              <>
                <input type="file" ref={fileInputRef} multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files.length) uploadFiles(e.target.files); }} />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={btnBlue}>{uploading ? "Uploading..." : "Upload"}</button>
                <button onClick={() => setShowNewFolder(true)} style={btnGray}>New Folder</button>
              </>
            )}
          </div>
        }
        emptyMessage="Empty folder"
      />
      <p style={{ fontSize: 11, color: "#999", marginTop: 8 }}>Drag items onto folders to move them. Click Rename to rename.</p>
    </div>
  );
}

const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const btnGray = { padding: "8px 16px", background: "#666", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const btnLink = { background: "none", border: "none", color: "#0070f3", cursor: "pointer", fontSize: 12, padding: "2px 4px" };
const btnDanger = { background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12, padding: "2px 4px" };
