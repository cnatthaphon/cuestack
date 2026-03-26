"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useUser } from "../../../../lib/user-context.js";

export default function AppViewer() {
  const { user, hasPermission } = useUser();
  const params = useParams();
  const slug = params.slug;
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [htmlContent, setHtmlContent] = useState("");

  useEffect(() => {
    if (!slug) return;
    // Load app info
    fetch("/api/apps")
      .then((r) => r.ok ? r.json() : { apps: [] })
      .then((d) => {
        const found = (d.apps || []).find((a) => a.slug === slug);
        if (!found) { setError("App not found"); setLoading(false); return; }
        if (found.status !== "published") { setError("App is not published"); setLoading(false); return; }
        if (found.permission_id && !hasPermission(found.permission_id)) {
          setError("You don't have permission to access this app");
          setLoading(false);
          return;
        }
        setApp(found);
        loadAppContent(found);
      });
  }, [slug]);

  const loadAppContent = async (appData) => {
    if (appData.app_type === "html") {
      // Load HTML from files
      try {
        const res = await fetch(`/api/files/download?path=/apps/${appData.slug}/${appData.entrypoint || "index.html"}`);
        if (res.ok) {
          const text = await res.text();
          setHtmlContent(text);
        } else {
          setHtmlContent(getDefaultHtml(appData));
        }
      } catch {
        setHtmlContent(getDefaultHtml(appData));
      }
    } else if (appData.app_type === "visual") {
      // Visual flow apps render from config
      setHtmlContent(""); // handled by visual renderer
    }
    setLoading(false);
  };

  if (!user) return null;

  if (loading) {
    return <div style={{ padding: 32, color: "#666" }}>Loading app...</div>;
  }

  if (error) {
    return (
      <div style={{ maxWidth: 600 }}>
        <h1 style={{ margin: "0 0 8px" }}>App Error</h1>
        <div style={{ padding: 32, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#e53e3e" }}>
          {error}
        </div>
      </div>
    );
  }

  if (!app) return null;

  // HTML/JS app — render in sandboxed iframe
  if (app.app_type === "html") {
    return (
      <div style={{ margin: -32, height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "8px 16px", background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>{app.icon}</span>
            <strong style={{ fontSize: 14 }}>{app.name}</strong>
          </div>
        </div>
        <iframe
          srcDoc={htmlContent}
          style={{ flex: 1, border: "none", width: "100%" }}
          title={app.name}
          sandbox="allow-scripts allow-forms allow-same-origin"
        />
      </div>
    );
  }

  // Visual flow app — render block output
  if (app.app_type === "visual") {
    const flow = typeof app.config === "string" ? JSON.parse(app.config) : (app.config || {});
    return (
      <div style={{ maxWidth: 900 }}>
        <h1 style={{ margin: "0 0 8px" }}>{app.icon} {app.name}</h1>
        {app.description && <p style={{ color: "#666", fontSize: 13, margin: "0 0 16px" }}>{app.description}</p>}
        <VisualFlowRenderer flow={flow} orgId={user.org_id} />
      </div>
    );
  }

  // Dash app — proxy (placeholder)
  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ margin: "0 0 8px" }}>{app.icon} {app.name}</h1>
      <p style={{ color: "#666", fontSize: 13 }}>{app.description}</p>
      <div style={{ padding: 32, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
        Dash app viewer — connects to the Python service for this app.
      </div>
    </div>
  );
}

// Simple visual flow renderer — executes block pipeline
function VisualFlowRenderer({ flow, orgId }) {
  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const blocks = flow.blocks || [];

  const runFlow = async () => {
    setRunning(true);
    // Execute blocks in sequence via pipeline API
    try {
      const res = await fetch("/api/pipeline/query");
      const data = await res.json();
      setOutput(data);
    } catch (e) {
      setOutput({ error: e.message });
    }
    setRunning(false);
  };

  if (blocks.length === 0) {
    return (
      <div style={{ padding: 32, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
        No blocks configured. Edit this app to add blocks.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {blocks.map((b, i) => (
          <div key={i} style={{
            padding: "8px 16px", background: "#e8f4ff", borderRadius: 6,
            border: "1px solid #0070f3", fontSize: 13, display: "flex", alignItems: "center", gap: 4,
          }}>
            <strong>{b.type}</strong>
            {i < blocks.length - 1 && <span style={{ marginLeft: 8, color: "#0070f3" }}>&rarr;</span>}
          </div>
        ))}
      </div>
      <button onClick={runFlow} disabled={running}
        style={{ padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, marginBottom: 16 }}>
        {running ? "Running..." : "Run Flow"}
      </button>
      {output && (
        <pre style={{ padding: 16, background: "#f7f7f7", borderRadius: 8, fontSize: 12, overflow: "auto", maxHeight: 400 }}>
          {JSON.stringify(output, null, 2)}
        </pre>
      )}
    </div>
  );
}

function getDefaultHtml(app) {
  return `<!DOCTYPE html>
<html>
<head><title>${app.name}</title><style>
body { font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto; color: #333; }
h1 { color: #0070f3; }
.info { background: #f7f7f7; padding: 20px; border-radius: 8px; margin-top: 20px; }
code { background: #e8f4ff; padding: 2px 6px; border-radius: 3px; }
</style></head>
<body>
<h1>${app.icon} ${app.name}</h1>
<p>${app.description || "Your app is ready."}</p>
<div class="info">
<h3>Getting Started</h3>
<p>Upload your app files to <code>/files/apps/${app.slug}/</code></p>
<p>Entry point: <code>${app.entrypoint || "index.html"}</code></p>
<p>Your app can use <code>fetch("/api/...")</code> to access org data.</p>
</div>
</body>
</html>`;
}
