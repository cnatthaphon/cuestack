"use client";

// Published app viewer — short URL /a/[slug]
// Resolves slug to published page in user_pages

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useUser } from "../../../../lib/user-context.js";

export default function AppViewer() {
  const { user, hasPermission } = useUser();
  const params = useParams();
  const slug = params.slug;
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/pages?view=published&slug=${slug}`)
      .then((r) => r.ok ? r.json() : { pages: [] })
      .then((d) => {
        const found = (d.pages || []).find((p) => p.slug === slug);
        if (!found) { setError("App not found"); setLoading(false); return; }
        if (found.status !== "published") { setError("App is not published"); setLoading(false); return; }
        if (found.permission_id && !hasPermission(found.permission_id)) {
          setError("You don't have permission to access this app");
          setLoading(false);
          return;
        }
        setPage(found);
        setLoading(false);
      });
  }, [slug]);

  if (!user) return null;
  if (loading) return <div style={{ padding: 32, color: "#666" }}>Loading app...</div>;
  if (error) return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ margin: "0 0 8px" }}>App Error</h1>
      <div style={{ padding: 32, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#e53e3e" }}>{error}</div>
    </div>
  );
  if (!page) return null;

  const cfg = typeof page.config === "string" ? JSON.parse(page.config) : (page.config || {});

  // HTML app — render in sandboxed iframe
  if (page.page_type === "html") {
    const html = cfg.html || getDefaultHtml(page);
    const srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif}</style>
<script src="/sdk.js"><\/script></head><body>${html}</body></html>`;
    return (
      <div style={{ margin: -32, height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "8px 16px", background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span>{page.icon}</span>
          <strong style={{ fontSize: 14 }}>{page.name}</strong>
        </div>
        <iframe srcDoc={srcdoc} style={{ flex: 1, border: "none", width: "100%" }} title={page.name} sandbox="allow-scripts allow-forms allow-same-origin" />
      </div>
    );
  }

  // Dashboard app — widget viewer
  if (page.page_type === "dashboard") {
    return <DashboardViewer page={page} cfg={cfg} />;
  }

  // Visual flow — placeholder
  if (page.page_type === "visual") {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{page.icon}</div>
        <h1>{page.name}</h1>
        <p style={{ color: "#666" }}>Visual flow viewer coming soon.</p>
      </div>
    );
  }

  // Notebook — redirect to notebook view
  if (page.page_type === "notebook") {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{page.icon}</div>
        <h1>{page.name}</h1>
        <p style={{ color: "#666" }}>This is a published notebook.</p>
      </div>
    );
  }

  return null;
}

function DashboardViewer({ page, cfg }) {
  const [widgetData, setWidgetData] = useState({});
  const widgets = cfg.widgets || [];
  const layout = cfg.layout || {};

  useEffect(() => { loadWidgetData(widgets); }, []);

  const loadWidgetData = async (w) => {
    const data = {};
    for (let i = 0; i < w.length; i++) {
      try {
        const res = await fetch("/api/dashboards/widget-data", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widget: w[i] }),
        });
        data[i] = await res.json();
      } catch { data[i] = { data: { error: "Failed" } }; }
    }
    setWidgetData(data);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>{page.icon} {page.name}</h1>
        <button onClick={() => loadWidgetData(widgets)} style={{ padding: "8px 16px", background: "#f0f0f0", color: "#333", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 13 }}>Refresh</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${layout.columns || 2}, 1fr)`, gap: 16 }}>
        {widgets.map((w, i) => (
          <div key={i} style={{
            background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16,
            gridColumn: `span ${w.colSpan || 1}`, gridRow: `span ${w.rowSpan || 1}`, minHeight: 80,
          }}>
            <DashWidget widget={w} data={widgetData[i]?.data} />
          </div>
        ))}
      </div>
      {widgets.length === 0 && (
        <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
          No widgets configured.
        </div>
      )}
    </div>
  );
}

function DashWidget({ widget, data }) {
  if (!data) return <div style={{ color: "#999", fontSize: 13 }}>Loading...</div>;
  if (data.error) return <div style={{ color: "#e53e3e", fontSize: 13 }}>{data.error}</div>;
  const { type, config } = widget;
  if (type === "stat") return <div style={{ textAlign: "center" }}><div style={{ fontSize: 11, color: "#666", textTransform: "uppercase" }}>{data.label}</div><div style={{ fontSize: 36, fontWeight: 700 }}>{data.value ?? "\u2014"}</div></div>;
  if (type === "text") return <div style={{ fontSize: 14, lineHeight: 1.6 }}>{config?.text || ""}</div>;
  if (type === "table") return (
    <div style={{ overflow: "auto" }}>
      {config?.title && <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>{config.title}</h3>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr>{(data.columns || []).map((c) => <th key={c} style={{ border: "1px solid #eee", padding: 4, background: "#f9fafb" }}>{c}</th>)}</tr></thead>
        <tbody>{(data.rows || []).slice(0, 20).map((r, i) => <tr key={i}>{(data.columns || []).map((c) => <td key={c} style={{ border: "1px solid #eee", padding: 4 }}>{r[c] != null ? String(r[c]) : ""}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  if (["bar", "line"].includes(type) && data.values) {
    const max = Math.max(...data.values, 1); const h = 140;
    return (
      <div>
        {config?.title && <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>{config.title}</h3>}
        <svg width="100%" height={h + 30} viewBox={`0 0 ${Math.max(data.values.length * 50, 200)} ${h + 30}`}>
          {data.values.map((v, i) => <g key={i}><rect x={i * 50 + 5} y={h - (v / max) * h} width={40} height={(v / max) * h} fill="#0070f3" rx={3} /><text x={i * 50 + 25} y={h + 14} textAnchor="middle" fontSize={9} fill="#666">{String(data.labels?.[i] || "").slice(0, 8)}</text></g>)}
        </svg>
      </div>
    );
  }
  return null;
}

function getDefaultHtml(page) {
  return `<div style="font-family:system-ui;padding:40px;max-width:600px;margin:0 auto">
<h1>${page.icon} ${page.name}</h1>
<p>This app is ready. Edit the HTML in your workspace to build your app.</p>
</div>`;
}
