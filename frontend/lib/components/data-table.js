"use client";

import { useState, useMemo } from "react";

/**
 * Reusable DataTable component.
 *
 * Props:
 *   columns: [{ key, label, render?, sortable?, width? }]
 *   data: array of row objects
 *   searchKeys: array of keys to search across (default: all)
 *   actions: (row) => JSX — per-row action buttons
 *   bulkActions: [{ label, onClick(selectedIds), color? }] — mass edit buttons
 *   onRowClick: (row) => void
 *   idKey: string (default "id") — unique row identifier
 *   pageSize: number (default 15)
 *   emptyMessage: string
 *   toolbar: JSX — extra toolbar content (create button, etc.)
 */
export default function DataTable({
  columns, data, searchKeys, actions, bulkActions,
  onRowClick, idKey = "id", pageSize = 15,
  emptyMessage = "No data", toolbar,
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(new Set());

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    const keys = searchKeys || columns.map((c) => c.key);
    return data.filter((row) =>
      keys.some((k) => String(row[k] || "").toLowerCase().includes(q))
    );
  }, [data, search, searchKeys, columns]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // Paginate
  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === paged.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paged.map((r) => r[idKey])));
    }
  };

  const hasBulk = bulkActions && bulkActions.length > 0;

  return (
    <div>
      {/* Toolbar: search + actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
          <input
            placeholder="Search..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            style={{ width: "100%", padding: "8px 8px 8px 32px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
          />
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#999", fontSize: 14 }}>{"\u{1F50D}"}</span>
        </div>
        {hasBulk && selected.size > 0 && (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#666" }}>{selected.size} selected</span>
            {bulkActions.map((ba) => (
              <button key={ba.label} onClick={() => { ba.onClick([...selected]); setSelected(new Set()); }}
                style={{ padding: "6px 12px", background: "none", border: `1px solid ${ba.color || "#ddd"}`, borderRadius: 4, cursor: "pointer", fontSize: 12, color: ba.color || "#333" }}>
                {ba.label}
              </button>
            ))}
          </div>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {toolbar}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflow: "auto", borderRadius: 8, border: "1px solid #e2e8f0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8f9fa" }}>
              {hasBulk && (
                <th style={{ ...thStyle, width: 36 }}>
                  <input type="checkbox" checked={paged.length > 0 && selected.size === paged.length} onChange={toggleAll} />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ ...thStyle, width: col.width, cursor: col.sortable !== false ? "pointer" : "default", userSelect: "none" }}
                  onClick={() => col.sortable !== false && toggleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span style={{ marginLeft: 4, fontSize: 10 }}>{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>
                  )}
                </th>
              ))}
              {actions && <th style={{ ...thStyle, width: 100 }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr><td colSpan={columns.length + (hasBulk ? 1 : 0) + (actions ? 1 : 0)} style={{ ...tdStyle, textAlign: "center", color: "#999", padding: 24 }}>{emptyMessage}</td></tr>
            )}
            {paged.map((row) => (
              <tr key={row[idKey]} onClick={() => onRowClick?.(row)}
                style={{ cursor: onRowClick ? "pointer" : "default", background: selected.has(row[idKey]) ? "#e8f4ff" : "transparent" }}>
                {hasBulk && (
                  <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(row[idKey])} onChange={() => toggleSelect(row[idKey])} />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} style={tdStyle}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] != null ? String(row[col.key]) : "\u2014")}
                  </td>
                ))}
                {actions && (
                  <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                    {actions(row)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 12, color: "#666" }}>
          <span>{sorted.length} results{search ? ` (filtered from ${data.length})` : ""}</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} style={pagBtn}>&larr;</button>
            <span style={{ padding: "4px 8px" }}>Page {page + 1} of {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={pagBtn}>&rarr;</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Shared styles
const thStyle = { padding: "10px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#555", borderBottom: "1px solid #e2e8f0" };
const tdStyle = { padding: "8px 12px", borderBottom: "1px solid #f0f0f0" };
const pagBtn = { padding: "4px 10px", background: "#fff", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };

// Helper renderers for common patterns
export function Badge({ children, color = "#666", bg = "#f7f7f7" }) {
  return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600, background: bg, color }}>{children}</span>;
}

export function DateCell({ value }) {
  if (!value) return "\u2014";
  return new Date(value).toLocaleDateString();
}

export function DateTimeCell({ value }) {
  if (!value) return "\u2014";
  return new Date(value).toLocaleString();
}
