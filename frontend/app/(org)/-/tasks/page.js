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

  useEffect(() => { loadTasks(); }, []);

  const loadTasks = async () => {
    const res = await fetch("/api/tasks");
    if (res.ok) {
      const d = await res.json();
      setTasks(d.tasks || []);
    }
    setLoading(false);
  };

  if (!user) return null;

  const columns = [
    {
      key: "page_name", label: "Task",
      render: (v, row) => (
        <Link href={`/my/${row.page_id}`} style={{ color: "#0070f3", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
          <span>{row.page_icon}</span>
          <span>{v}</span>
          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "#f0f0f0", color: "#666" }}>{row.page_type}</span>
        </Link>
      ),
    },
    {
      key: "schedule", label: "Schedule",
      render: (v) => (
        <div>
          <div style={{ fontSize: 13 }}>{cronLabel(v?.cron || "")}</div>
          <code style={{ fontSize: 10, color: "#999" }}>{v?.cron || "none"}</code>
        </div>
      ),
    },
    {
      key: "schedule", label: "Status",
      render: (v) => {
        const enabled = v?.enabled !== false;
        return (
          <span style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
            background: enabled ? "#f0fde8" : "#f7f7f7",
            color: enabled ? "#38a169" : "#999",
          }}>
            {enabled ? "Active" : "Paused"}
          </span>
        );
      },
    },
    { key: "owner_name", label: "Owner" },
    {
      key: "schedule", label: "Last Run",
      render: (v) => v?.last_run ? <DateTimeCell value={v.last_run} /> : <span style={{ color: "#ccc" }}>Never</span>,
    },
    {
      key: "schedule", label: "Next Run",
      render: (v) => v?.next_run ? <DateTimeCell value={v.next_run} /> : <span style={{ color: "#ccc" }}>---</span>,
    },
    { key: "updated_at", label: "Updated", render: (v) => <DateTimeCell value={v} /> },
  ];

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 4px" }}>Scheduled Tasks</h1>
        <p style={{ color: "#666", fontSize: 13, margin: 0 }}>
          All scheduled items across the organization. Add a schedule from any page in your workspace.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={tasks}
        idKey="page_id"
        searchKeys={["page_name", "owner_name"]}
        emptyMessage="No scheduled tasks. Open a page in your workspace and click Schedule to add one."
      />

      <div style={{ marginTop: 24, padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>How Scheduling Works</h3>
        <div style={{ fontSize: 13, color: "#666", lineHeight: 1.8 }}>
          1. Open any notebook, web page, or visual flow in your workspace<br />
          2. Click the <strong>Schedule</strong> button in the page header<br />
          3. Set a cron schedule (e.g., every hour, daily at 8 AM)<br />
          4. The system runs your page automatically on schedule<br />
          <br />
          <strong>Supported page types:</strong> Notebooks (execute all cells), HTML/JS (trigger run endpoint), Visual flows (execute pipeline)
        </div>
      </div>
    </div>
  );
}
