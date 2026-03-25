"use client";

import { useUser } from "../../../lib/user-context.js";

export default function ServicesPage() {
  const { user, org } = useUser();
  if (!user) return null;

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 8px" }}>Services</h1>
      <p style={{ color: "#666", fontSize: 13, margin: "0 0 20px" }}>
        Deploy Python services from notebooks or code. Create FastAPI endpoints, scheduled jobs, and background workers.
      </p>
      <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
        Coming soon — deploy Python code as managed services with auto-scaling.
      </div>
    </div>
  );
}
