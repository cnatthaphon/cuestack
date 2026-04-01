"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "../../../../../lib/user-context.js";

// Column type → input type mapping for form generation
const INPUT_MAP = {
  text: "text", long_text: "textarea", integer: "number", bigint: "number",
  float: "number", boolean: "checkbox", timestamp: "datetime-local",
  date: "date", json: "json", uuid: "text", serial: "number",
};

const FILTER_OPS = [
  { id: "eq", label: "=" }, { id: "neq", label: "!=" },
  { id: "gt", label: ">" }, { id: "lt", label: "<" },
  { id: "gte", label: ">=" }, { id: "lte", label: "<=" },
  { id: "contains", label: "contains" }, { id: "starts", label: "starts with" },
  { id: "null", label: "is null" }, { id: "notnull", label: "is not null" },
];

export default function TableViewerPage() {
  const { user, hasPermission } = useUser();
  const params = useParams();
  const router = useRouter();
  const tableId = params.id;

  const canEdit = hasPermission("db.edit");

  // Data state
  const [table, setTable] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  // Sort
  const [sortCol, setSortCol] = useState("created_at");
  const [sortDir, setSortDir] = useState("DESC");

  // Filters
  const [filters, setFilters] = useState([]);
  const [showFilterBar, setShowFilterBar] = useState(false);

  // Dialogs
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const columns = table ? (typeof table.columns === "string" ? JSON.parse(table.columns) : (table.columns || [])) : [];
  const allCols = ["id", ...columns.map((c) => c.name), "created_at"];

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: pageSize, offset: page * pageSize,
      order_by: sortCol, order_dir: sortDir,
    });
    for (const f of filters) {
      if (f.column && f.op) params.append("filter", `${f.column}:${f.op}:${f.value || ""}`);
    }
    const res = await fetch(`/api/tables/${tableId}/data?${params}`);
    if (!res.ok) { router.push("/-/databases"); return; }
    const d = await res.json();
    setTable(d.table);
    setRows(d.rows || []);
    setTotal(d.total || 0);
    setSelected(new Set());
    setLoading(false);
  }, [tableId, page, pageSize, sortCol, sortDir, filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Sort handler
  const toggleSort = (col) => {
    if (sortCol === col) { setSortDir(sortDir === "ASC" ? "DESC" : "ASC"); }
    else { setSortCol(col); setSortDir("ASC"); }
    setPage(0);
  };

  // Filter handlers
  const addFilter = () => setFilters([...filters, { column: columns[0]?.name || "id", op: "eq", value: "" }]);
  const removeFilter = (i) => { setFilters(filters.filter((_, j) => j !== i)); setPage(0); };
  const updateFilter = (i, key, val) => { setFilters(filters.map((f, j) => j === i ? { ...f, [key]: val } : f)); };
  const applyFilters = () => { setPage(0); fetchData(); };

  // Selection
  const toggleSelect = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const selectAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  // Delete
  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} record(s)?`)) return;
    await fetch(`/api/tables/${tableId}/data`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record_ids: [...selected] }),
    });
    fetchData();
  };

  // Save record (create or update)
  const saveRecord = async (data, recordId) => {
    if (recordId) {
      await fetch(`/api/tables/${tableId}/data`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_id: recordId, data }),
      });
    } else {
      await fetch(`/api/tables/${tableId}/data`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }
    setShowForm(false);
    setEditRecord(null);
    fetchData();
  };

  // Duplicate record — copies all user columns, server assigns new id/created_at
  const duplicateRecord = async (row) => {
    const data = {};
    for (const col of columns) {
      if (row[col.name] != null) data[col.name] = row[col.name];
    }
    try {
      await fetch(`/api/tables/${tableId}/data`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      fetchData();
    } catch (e) {
      console.error("Duplicate failed:", e);
    }
  };

  if (!user) return null;
  if (!table && !loading) return <div style={{ padding: 32 }}>Table not found</div>;

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link href="/-/databases" style={{ color: "#666", textDecoration: "none", fontSize: 13 }}>&larr; Databases</Link>
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 20 }}>
            <code>{table?.name || "..."}</code>
            <span style={{ fontSize: 13, color: "#999", fontWeight: 400, marginLeft: 12 }}>{total.toLocaleString()} records</span>
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowFilterBar(!showFilterBar)} style={{ ...btn, background: filters.length > 0 ? "#e8f4ff" : "#f0f0f0" }}>
            Filter {filters.length > 0 ? `(${filters.length})` : ""}
          </button>
          <button onClick={fetchData} style={btn}>Refresh</button>
          {canEdit && <button onClick={() => { setEditRecord(null); setShowForm(true); }} style={btnBlue}>+ Add Record</button>}
          {canEdit && selected.size > 0 && (
            <button onClick={deleteSelected} style={{ ...btn, color: "#e53e3e", borderColor: "#e53e3e" }}>
              Delete ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      {showFilterBar && (
        <div style={{ marginBottom: 12, padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          {filters.map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 4, marginBottom: 4, alignItems: "center" }}>
              <select value={f.column} onChange={(e) => updateFilter(i, "column", e.target.value)} style={filterInput}>
                {allCols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={f.op} onChange={(e) => updateFilter(i, "op", e.target.value)} style={{ ...filterInput, width: 120 }}>
                {FILTER_OPS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              {!["null", "notnull"].includes(f.op) && (
                <input value={f.value} onChange={(e) => updateFilter(i, "value", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                  placeholder="Value..." style={{ ...filterInput, flex: 1 }} />
              )}
              <button onClick={() => removeFilter(i)} style={{ ...btn, padding: "4px 8px", fontSize: 11 }}>x</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={addFilter} style={{ ...btn, fontSize: 11 }}>+ Add Filter</button>
            {filters.length > 0 && <button onClick={applyFilters} style={{ ...btnBlue, fontSize: 11, padding: "4px 12px" }}>Apply</button>}
            {filters.length > 0 && <button onClick={() => { setFilters([]); setPage(0); }} style={{ ...btn, fontSize: 11 }}>Clear All</button>}
          </div>
        </div>
      )}

      {/* Data table */}
      <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {canEdit && (
                <th style={th}>
                  <input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={selectAll} />
                </th>
              )}
              {allCols.map((col) => (
                <th key={col} style={{ ...th, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }} onClick={() => toggleSort(col)}>
                  {col}
                  {sortCol === col && <span style={{ marginLeft: 4 }}>{sortDir === "ASC" ? "\u25B2" : "\u25BC"}</span>}
                </th>
              ))}
              {canEdit && <th style={th}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={allCols.length + (canEdit ? 2 : 0)} style={{ ...td, textAlign: "center", color: "#999", padding: 32 }}>Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={allCols.length + (canEdit ? 2 : 0)} style={{ ...td, textAlign: "center", color: "#999", padding: 32 }}>
                {filters.length > 0 ? "No records match filters" : "No records yet"}
              </td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} style={{ background: selected.has(row.id) ? "#f0f7ff" : "transparent" }}>
                {canEdit && (
                  <td style={td}><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} /></td>
                )}
                {allCols.map((col) => (
                  <td key={col} style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={row[col] != null ? String(row[col]) : ""}>
                    {col === "created_at" ? new Date(row[col]).toLocaleString() : (row[col] != null ? String(row[col]) : <span style={{ color: "#ccc" }}>null</span>)}
                  </td>
                ))}
                {canEdit && (
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <button onClick={() => { setEditRecord(row); setShowForm(true); }} style={actionBtn}>Edit</button>
                    <button onClick={() => duplicateRecord(row)} style={{ ...actionBtn, marginLeft: 4 }}>Duplicate</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <div style={{ fontSize: 12, color: "#666" }}>
          Showing {rows.length > 0 ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, total)} of {total.toLocaleString()}
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <select value={pageSize} onChange={(e) => { setPageSize(parseInt(e.target.value)); setPage(0); }} style={{ ...filterInput, width: "auto" }}>
            {[25, 50, 100, 250, 500, 1000].map((n) => <option key={n} value={n}>{n} rows</option>)}
          </select>
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} style={btn}>&larr;</button>
          <span style={{ fontSize: 12, color: "#666", padding: "0 8px" }}>Page {page + 1} / {totalPages || 1}</span>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={btn}>&rarr;</button>
        </div>
      </div>

      {/* Record form dialog */}
      {showForm && (
        <RecordForm
          columns={columns}
          record={editRecord}
          onSave={saveRecord}
          onClose={() => { setShowForm(false); setEditRecord(null); }}
        />
      )}
    </div>
  );
}

// ─── Record Form (auto-generated from column schema) ──────────────────────────
function RecordForm({ columns, record, onSave, onClose }) {
  const isEdit = !!record;
  const [formData, setFormData] = useState(() => {
    if (record) {
      const d = {};
      for (const col of columns) d[col.name] = record[col.name] ?? "";
      return d;
    }
    const d = {};
    for (const col of columns) {
      d[col.name] = col.default_value ?? (col.type === "boolean" ? false : "");
    }
    return d;
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    // Convert types
    const data = {};
    for (const col of columns) {
      let val = formData[col.name];
      if (val === "" && col.nullable) { data[col.name] = null; continue; }
      if (col.type === "integer" || col.type === "bigint") val = parseInt(val) || 0;
      if (col.type === "float") val = parseFloat(val) || 0;
      if (col.type === "boolean") val = val === true || val === "true";
      if (col.type === "json") { try { val = JSON.parse(val); } catch { val = {}; } }
      data[col.name] = val;
    }
    await onSave(data, record?.id);
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 600, maxHeight: "80vh", overflow: "auto" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>{isEdit ? "Edit Record" : "New Record"}</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {columns.map((col) => {
              const inputType = INPUT_MAP[col.type] || "text";
              const isWide = inputType === "textarea" || inputType === "json";
              return (
                <div key={col.name} style={{ gridColumn: isWide ? "span 2" : "auto" }}>
                  <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 2 }}>
                    {col.name}
                    <span style={{ color: "#bbb", marginLeft: 4 }}>{col.type}</span>
                    {!col.nullable && <span style={{ color: "#e53e3e", marginLeft: 2 }}>*</span>}
                  </label>
                  {inputType === "textarea" || inputType === "json" ? (
                    <textarea
                      value={typeof formData[col.name] === "object" ? JSON.stringify(formData[col.name], null, 2) : (formData[col.name] || "")}
                      onChange={(e) => setFormData({ ...formData, [col.name]: e.target.value })}
                      rows={inputType === "json" ? 4 : 3}
                      style={{ ...formInput, fontFamily: inputType === "json" ? "monospace" : "inherit", minHeight: 60 }}
                      required={!col.nullable}
                    />
                  ) : inputType === "checkbox" ? (
                    <input type="checkbox" checked={formData[col.name] === true || formData[col.name] === "true"}
                      onChange={(e) => setFormData({ ...formData, [col.name]: e.target.checked })} style={{ marginTop: 4 }} />
                  ) : (
                    <input
                      type={inputType}
                      value={formData[col.name] ?? ""}
                      onChange={(e) => setFormData({ ...formData, [col.name]: e.target.value })}
                      step={col.type === "float" ? "any" : undefined}
                      required={!col.nullable}
                      style={formInput}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={btn}>Cancel</button>
            <button type="submit" disabled={saving} style={btnBlue}>{saving ? "Saving..." : isEdit ? "Update" : "Create"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const th = { border: "1px solid #eee", padding: "8px 10px", background: "#f9fafb", textAlign: "left", fontSize: 11, fontWeight: 600 };
const td = { border: "1px solid #eee", padding: "6px 10px", fontSize: 12 };
const btn = { padding: "6px 14px", background: "#f0f0f0", color: "#333", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const btnBlue = { padding: "6px 14px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const actionBtn = { padding: "2px 8px", background: "none", border: "1px solid #ddd", borderRadius: 3, cursor: "pointer", fontSize: 11, color: "#0070f3" };
const filterInput = { padding: "4px 8px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 };
const formInput = { width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 13, boxSizing: "border-box" };
