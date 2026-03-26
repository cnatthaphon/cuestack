"use client";

import { useEffect, useState, useRef } from "react";
import { useUser } from "../../../lib/user-context.js";

export default function FilesPage() {
  const { user, hasPermission } = useUser();
  const [files, setFiles] = useState([]);
  const [storage, setStorage] = useState(null);
  const [currentPath, setCurrentPath] = useState("/");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [newDirName, setNewDirName] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => { loadFiles("/"); }, []);

  const loadFiles = async (dir) => {
    const res = await fetch(`/api/files?path=${encodeURIComponent(dir)}`);
    if (res.ok) {
      const data = await res.json();
      setFiles(data.files || []);
      setStorage(data.storage);
      setCurrentPath(dir);
    }
  };

  const navigateTo = (dir) => {
    loadFiles(dir);
    setError("");
  };

  const goUp = () => {
    if (currentPath === "/") return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    navigateTo("/" + parts.join("/") || "/");
  };

  const uploadFiles = async (fileList) => {
    setUploading(true);
    setError("");
    for (const file of fileList) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", currentPath);
      const res = await fetch("/api/files", { method: "POST", body: formData });
      if (!res.ok) {
        setError((await res.json()).error);
        break;
      }
    }
    setUploading(false);
    loadFiles(currentPath);
  };

  const createDirectory = async () => {
    if (!newDirName.trim()) return;
    setError("");
    const dirPath = currentPath === "/" ? `/${newDirName}` : `${currentPath}/${newDirName}`;
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mkdir", path: dirPath }),
    });
    if (!res.ok) setError((await res.json()).error);
    setNewDirName("");
    loadFiles(currentPath);
  };

  const deleteItem = async (filePath, name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    const res = await fetch(`/api/files?path=${encodeURIComponent(filePath)}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error);
    loadFiles(currentPath);
  };

  const downloadItem = (filePath) => {
    window.open(`/api/files/download?path=${encodeURIComponent(filePath)}`, "_blank");
  };

  if (!user) return null;

  const breadcrumbs = ["/", ...currentPath.split("/").filter(Boolean)];

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

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
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 16, fontSize: 13 }}>
        {breadcrumbs.map((part, i) => {
          const path = i === 0 ? "/" : "/" + breadcrumbs.slice(1, i + 1).join("/");
          return (
            <span key={i}>
              {i > 0 && <span style={{ color: "#999", margin: "0 4px" }}>/</span>}
              <button onClick={() => navigateTo(path)} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", padding: 0, fontSize: 13 }}>
                {i === 0 ? "Home" : part}
              </button>
            </span>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {hasPermission("files.upload") && (
          <>
            <input type="file" ref={fileInputRef} multiple style={{ display: "none" }}
              onChange={(e) => { if (e.target.files.length) uploadFiles(e.target.files); }} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={btnBlue}>
              {uploading ? "Uploading..." : "Upload Files"}
            </button>
            <input placeholder="New folder name" value={newDirName}
              onChange={(e) => setNewDirName(e.target.value.replace(/[^a-zA-Z0-9_\-. ]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && createDirectory()}
              style={inputStyle} />
            <button onClick={createDirectory} disabled={!newDirName.trim()} style={btnGray}>Create Folder</button>
          </>
        )}
        {currentPath !== "/" && (
          <button onClick={goUp} style={btnGray}>&larr; Up</button>
        )}
      </div>
      {error && <p style={{ color: "#e53e3e", margin: "0 0 12px", fontSize: 13 }}>{error}</p>}

      {/* File list */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>{["Name", "Size", "Modified", ""].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {files.length === 0 && (
            <tr><td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: "#999" }}>Empty folder</td></tr>
          )}
          {files.map((f) => (
            <tr key={f.path}>
              <td style={tdStyle}>
                {f.type === "directory" ? (
                  <button onClick={() => navigateTo(f.path)} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", padding: 0, fontSize: 13 }}>
                    {"\u{1F4C1}"} {f.name}
                  </button>
                ) : (
                  <span style={{ fontSize: 13 }}>{"\u{1F4C4}"} {f.name}</span>
                )}
              </td>
              <td style={tdStyle}>{f.type === "file" ? formatSize(f.size) : "\u2014"}</td>
              <td style={tdStyle}>{new Date(f.modified).toLocaleString()}</td>
              <td style={tdStyle}>
                {f.type === "file" && (
                  <button onClick={() => downloadItem(f.path)} style={btnLink}>Download</button>
                )}
                {hasPermission("files.delete") && (
                  <button onClick={() => deleteItem(f.path, f.name)} style={btnDanger}>Delete</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const btnGray = { padding: "8px 16px", background: "#666", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const btnLink = { background: "none", border: "none", color: "#0070f3", cursor: "pointer", fontSize: 12, marginRight: 8 };
const btnDanger = { background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: 12 };
const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, width: 180 };
const thStyle = { border: "1px solid #ddd", padding: 8, background: "#f5f5f5", textAlign: "left", fontSize: 13 };
const tdStyle = { border: "1px solid #ddd", padding: 8, fontSize: 13 };
