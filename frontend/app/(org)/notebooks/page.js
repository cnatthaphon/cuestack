"use client";

import { useUser } from "../../../lib/user-context.js";

export default function NotebooksPage() {
  const { user, org } = useUser();
  if (!user) return null;

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 8px" }}>Notebooks</h1>
      <p style={{ color: "#666", fontSize: 13, margin: "0 0 20px" }}>
        Jupyter notebooks with direct access to your organization's database. Write Python, analyze data, build models.
      </p>
      <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
        Coming soon — Jupyter integration with SSO, org DB connection, and Python environment.
      </div>
    </div>
  );
}
