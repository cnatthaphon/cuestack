"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useUser } from "../../../../../lib/user-context.js";
import FlowEditor from "./flow-editor.js";

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

  // Visual flow app — full flow editor
  if (app.app_type === "visual") {
    return <VisualFlowApp app={app} />;
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

// Visual flow app — uses FlowEditor with save + run
function VisualFlowApp({ app }) {
  const [tables, setTables] = useState([]);
  const [runResults, setRunResults] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentBlocks, setCurrentBlocks] = useState(null);

  useEffect(() => {
    fetch("/api/tables").then((r) => r.ok ? r.json() : { tables: [] }).then((d) => setTables(d.tables || []));
  }, []);

  const config = typeof app.config === "string" ? JSON.parse(app.config) : (app.config || {});
  const initialBlocks = config.blocks || [];

  const handleRun = async (blocks) => {
    setRunResults(null);
    const res = await fetch("/api/flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
    const data = await res.json();
    setRunResults(data.results || [{ error: data.error }]);
  };

  const handleSave = async () => {
    if (!currentBlocks) return;
    setSaving(true);
    await fetch(`/api/apps/${app.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { blocks: currentBlocks } }),
    });
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 20 }}>{app.icon} {app.name}</h1>
          {app.description && <p style={{ color: "#666", fontSize: 13, margin: 0 }}>{app.description}</p>}
        </div>
        <button onClick={handleSave} disabled={saving} style={{
          padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13,
        }}>
          {saving ? "Saving..." : "Save Flow"}
        </button>
      </div>
      <FlowEditor
        initialBlocks={initialBlocks}
        tables={tables}
        onSave={(blocks) => setCurrentBlocks(blocks)}
        onRun={handleRun}
        runResults={runResults}
      />
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
