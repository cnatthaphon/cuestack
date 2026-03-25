"use client";

import { useUser } from "../../../lib/user-context.js";

export default function DashboardsPage() {
  const { user, org } = useUser();
  if (!user) return null;

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 8px" }}>Dashboards</h1>
      <p style={{ color: "#666", fontSize: 13, margin: "0 0 20px" }}>
        Create and manage data dashboards for your organization.
      </p>
      <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
        Coming soon — drag-and-drop dashboard builder with charts, tables, and widgets.
      </div>
    </div>
  );
}
