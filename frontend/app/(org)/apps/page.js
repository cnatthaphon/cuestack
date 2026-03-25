"use client";

import { useUser } from "../../../lib/user-context.js";

export default function AppsPage() {
  const { user, org } = useUser();
  if (!user) return null;

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 8px" }}>Apps</h1>
      <p style={{ color: "#666", fontSize: 13, margin: "0 0 20px" }}>
        Build and deploy web apps for your organization. Use Dash (Python), JS+HTML, or visual programming (rete.js).
      </p>
      <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
        Coming soon — app builder with three modes:
        <ul style={{ textAlign: "left", maxWidth: 400, margin: "16px auto", lineHeight: 2 }}>
          <li><strong>Dash apps</strong> — Python dashboards from Jupyter notebooks</li>
          <li><strong>JS + HTML</strong> — custom web apps with org API access</li>
          <li><strong>Visual programming</strong> — node-based editor (rete.js style)</li>
        </ul>
      </div>
    </div>
  );
}
