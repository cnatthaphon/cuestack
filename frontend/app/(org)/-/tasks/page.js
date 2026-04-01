"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "../../../../lib/user-context.js";
import DataTable, { DateTimeCell } from "../../../../lib/components/data-table.js";

const CRON_LABELS = {
  "*/5 * * * *": "Every 5 min",
  "*/15 * * * *": "Every 15 min",
  "*/30 * * * *": "Every 30 min",
  "0 * * * *": "Every hour",
  "0 */6 * * *": "Every 6 hours",
  "0 0 * * *": "Daily at midnight",
  "0 8 * * *": "Daily at 8 AM",
  "0 0 * * 1": "Weekly (Mon)",
};

function cronLabel(cron) {
  return CRON_LABELS[cron] || cron;
}

export default function TasksPage() {
  const { user, hasPermission } = useUser();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const canManage = hasPermission("tasks.manage");

  useEffect(() => { loadTasks(); }, []);

  const loadLogs = async (task) => {
    setSelectedTask(task);
    setLogsLoading(true);
    const res = await fetch(`/api/tasks/${task.page_id}?limit=20`);
    if (res.ok) {
      const d = await res.json();
      setLogs(d.logs || []);
    }
    setLogsLoading(false);
  };

  const loadTasks = async () => {
    const res = await fetch("/api/tasks");
    if (res.ok) {
      const d = await res.json();
      setTasks(d.tasks || []);
    }
    setLoading(false);
  };

  const toggleTask = async (pageId, schedule, enable) => {
    await fetch(`/api/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_id: pageId, enabled: enable }),
    });
    loadTasks();
  };

  const removeSchedule = async (pageId) => {
    if (!confirm("Remove schedule from this task?")) return;
    await fetch(`/api/tasks`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_id: pageId }),
    });
    loadTasks();
  };

  if (!user) return null;

  const columns = [
    {
      key: "page_name", label: "Task",
      render: (v, row) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>{row.page_icon}</span>
          <Link href={`/my/${row.page_id}`} style={{ color: "#0070f3", textDecoration: "none" }}>{v}</Link>
          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "#f0f0f0", color: "#666" }}>{row.page_type}</span>
          <button onClick={() => loadLogs(row)} style={{ fontSize: 10, padding: "1px 6px", background: "none", border: "1px solid #ddd", borderRadius: 3, cursor: "pointer", color: "#666" }}>logs</button>
        </div>
      ),
    },
    {
      key: "schedule_cron", label: "Schedule", dataKey: "schedule",
      render: (v) => (
        <div>
          <div style={{ fontSize: 13 }}>{cronLabel(v?.cron || "")}</div>
          <code style={{ fontSize: 10, color: "#999" }}>{v?.cron || "none"}</code>
        </div>
      ),
    },
    {
      key: "schedule_status", label: "Status", dataKey: "schedule",
      render: (v, row) => {
        const enabled = v?.enabled !== false;
        return (
          <span style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
            background: enabled ? "#f0fde8" : "#f7f7f7",
            color: enabled ? "#38a169" : "#999",
            cursor: canManage ? "pointer" : "default",
          }}
          onClick={canManage ? () => toggleTask(row.page_id, v, !enabled) : undefined}
          title={canManage ? `Click to ${enabled ? "pause" : "resume"}` : ""}
          >
            {enabled ? "Active" : "Paused"}
          </span>
        );
      },
    },
    { key: "owner_name", label: "Owner" },
    {
      key: "schedule_last", label: "Last Run", dataKey: "schedule",
      render: (v) => v?.last_run ? <DateTimeCell value={v.last_run} /> : <span style={{ color: "#ccc" }}>Never</span>,
    },
    {
      key: "schedule_next", label: "Next Run", dataKey: "schedule",
      render: (v) => v?.next_run ? <DateTimeCell value={v.next_run} /> : <span style={{ color: "#ccc" }}>---</span>,
    },
    { key: "updated_at", label: "Updated", render: (v) => <DateTimeCell value={v} /> },
  ];

  // Add actions column if user can manage
  if (canManage) {
    columns.push({
      key: "page_id", label: "",
      render: (v, row) => (
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => toggleTask(v, row.schedule, row.schedule?.enabled === false)}
            style={actionBtn}>{row.schedule?.enabled === false ? "Resume" : "Pause"}</button>
          <button onClick={() => removeSchedule(v)} style={{ ...actionBtn, color: "#e53e3e" }}>Remove</button>
        </div>
      ),
    });
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 4px" }}>Scheduled Tasks</h1>
        <p style={{ color: "#666", fontSize: 13, margin: 0 }}>
          All scheduled items across the organization.{canManage ? " You can pause, resume, or remove any schedule." : ""}
        </p>
      </div>

      <DataTable
        columns={columns}
        data={tasks}
        idKey="page_id"
        searchKeys={["page_name", "owner_name"]}
        emptyMessage="No scheduled tasks. Open a page in your workspace and click Schedule to add one."
      />

      {/* Execution logs panel */}
      {selectedTask && (
        <TaskLogs task={selectedTask} logs={logs} loading={logsLoading} onClose={() => setSelectedTask(null)} />
      )}

      <div style={{ marginTop: 24, padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>How Scheduling Works</h3>
        <div style={{ fontSize: 13, color: "#666", lineHeight: 1.8 }}>
          1. Open any notebook, web page, or visual flow in your workspace<br />
          2. Click the <strong>Schedule</strong> button in the page header (requires <code>pages.schedule</code> permission)<br />
          3. Set a cron schedule (e.g., every hour, daily at 8 AM)<br />
          4. The system runs your page automatically on schedule<br />
          <br />
          <strong>Permissions:</strong><br />
          <code>pages.schedule</code> — add/edit schedules on your own pages<br />
          <code>tasks.view</code> — view this page<br />
          <code>tasks.manage</code> — pause/resume/remove any schedule
        </div>
      </div>
    </div>
  );
}

function TaskLogs({ task, logs, loading, onClose }) {
  return (
    <div style={{ marginTop: 16, padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>
          {task.page_icon} {task.page_name} — Execution Logs
        </h3>
        <button onClick={onClose} style={{ background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", padding: "2px 8px", fontSize: 12 }}>Close</button>
      </div>
      {loading ? (
        <div style={{ color: "#999", fontSize: 13 }}>Loading logs...</div>
      ) : logs.length === 0 ? (
        <div style={{ color: "#999", fontSize: 13, padding: 16, textAlign: "center" }}>No execution logs yet.</div>
      ) : (
        <div style={{ overflow: "auto", maxHeight: 400 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>Message</th>
                <th style={thStyle}>Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={tdStyle}>{new Date(log.created_at).toLocaleString()}</td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: 10, padding: "1px 6px", borderRadius: 3, fontWeight: 600,
                      background: log.status === "success" ? "#f0fde8" : log.status === "running" ? "#e8f4ff" : "#fef2f2",
                      color: log.status === "success" ? "#38a169" : log.status === "running" ? "#0070f3" : "#e53e3e",
                    }}>{log.status}</span>
                  </td>
                  <td style={tdStyle}>{log.duration_ms != null ? `${log.duration_ms}ms` : "—"}</td>
                  <td style={tdStyle}>{log.message || "—"}</td>
                  <td style={{ ...tdStyle, color: "#e53e3e", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={log.error || ""}>{log.error || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle = { border: "1px solid #eee", padding: "6px 8px", background: "#f9fafb", textAlign: "left", fontSize: 11, whiteSpace: "nowrap" };
const tdStyle = { border: "1px solid #eee", padding: "4px 8px" };
const actionBtn = { padding: "3px 10px", background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 11, color: "#666" };
