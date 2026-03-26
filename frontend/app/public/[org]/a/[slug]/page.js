"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// Public app viewer — no login required
// URL: /public/[org-slug]/a/[app-slug]
export default function PublicApp() {
  const params = useParams();
  const [app, setApp] = useState(null);
  const [htmlContent, setHtmlContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/public/${params.org}/apps/${params.slug}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "App not found" : "Access denied");
        return r.json();
      })
      .then((d) => {
        setApp(d.app);
        if (d.html) setHtmlContent(d.html);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.org, params.slug]);

  if (loading) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#666" }}>Loading...</div>;
  if (error) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#e53e3e" }}>{error}</div>;
  if (!app) return null;

  if (app.app_type === "html") {
    return (
      <iframe srcDoc={htmlContent} style={{ width: "100%", height: "100vh", border: "none" }}
        title={app.name} sandbox="allow-scripts allow-forms" />
    );
  }

  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>{app.icon} {app.name}</h1>
      <p style={{ color: "#666" }}>{app.description}</p>
    </div>
  );
}
