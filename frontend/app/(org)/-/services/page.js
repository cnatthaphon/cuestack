"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../../lib/user-context.js";

export default function ServicesPage() {
  const { user, hasPermission, hasFeature } = useUser();
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({ name: "", description: "", entrypoint: "main.py" });
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { loadServices(); }, []);

  const loadServices = () => {
    fetch("/api/services").then((r) => r.ok ? r.json() : { services: [] }).then((d) => setServices(d.services || []));
  };

  if (!user) return null;

  if (!hasFeature("python_services")) {
    return (
      <div style={{ maxWidth: 900 }}>
        <h1 style={{ margin: "0 0 8px" }}>Services</h1>
        <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
          Python Services feature is not enabled for your organization.
        </div>
      </div>
    );
  }

  const createService = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setForm({ name: "", description: "", entrypoint: "main.py" });
    setShowCreate(false);
    loadServices();
  };

  const toggleService = async (id, currentStatus) => {
    const action = currentStatus === "running" ? "stop" : "start";
    await fetch(`/api/services/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    loadServices();
  };

  const deleteService = async (id, name) => {
    if (!confirm(`Delete service "${name}"?`)) return;
    await fetch(`/api/services/${id}`, { method: "DELETE" });
    loadServices();
  };

  const canManage = hasPermission("services.manage");

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: "0 0 4px" }}>Services</h1>
          <p style={{ color: "#666", fontSize: 13, margin: 0 }}>
            Deploy Python services — FastAPI endpoints, scheduled jobs, background workers.
          </p>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(!showCreate)} style={btnBlue}>
            {showCreate ? "Cancel" : "New Service"}
          </button>
        )}
      </div>

      {showCreate && (
        <form onSubmit={createService} style={{ padding: 20, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Create Service</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input placeholder="service-name (lowercase)" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} style={inputStyle} />
            <input placeholder="Entrypoint (e.g. main.py)" value={form.entrypoint}
              onChange={(e) => setForm({ ...form, entrypoint: e.target.value })} style={inputStyle} />
          </div>
          <input placeholder="Description" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, width: "100%", marginBottom: 12 }} />
          <button type="submit" style={btnBlue}>Create</button>
          {error && <p style={{ color: "#e53e3e", margin: "8px 0 0", fontSize: 13 }}>{error}</p>}

          <div style={{ marginTop: 12, padding: 12, background: "#f7f7f7", borderRadius: 6, fontSize: 12, color: "#666" }}>
            <strong>How it works:</strong><br />
            1. Create a service with a Python entrypoint file<br />
            2. Upload your Python code to <code>/files/services/your-service/</code><br />
            3. Start the service — it runs as a FastAPI process<br />
            4. Access your API at <code>/api/v1/services/your-service/</code>
          </div>
        </form>
      )}

      {services.length > 0 ? (
        <div>
          {services.map((s) => (
            <div key={s.id} style={{ padding: 16, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong>{s.name}</strong>
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                    background: s.status === "running" ? "#f0fde8" : s.status === "error" ? "#fef2f2" : "#f7f7f7",
                    color: s.status === "running" ? "#38a169" : s.status === "error" ? "#e53e3e" : "#999",
                  }}>
                    {s.status}
                  </span>
                </div>
                {s.description && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>{s.description}</p>}
                <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                  Entrypoint: <code>{s.entrypoint}</code>
                  {s.created_by_name && <span> &middot; by {s.created_by_name}</span>}
                  <span> &middot; {new Date(s.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              {canManage && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => toggleService(s.id, s.status)} style={{
                    ...btnSmall,
                    color: s.status === "running" ? "#e53e3e" : "#38a169",
                    borderColor: s.status === "running" ? "#e53e3e" : "#38a169",
                  }}>
                    {s.status === "running" ? "Stop" : "Start"}
                  </button>
                  <button onClick={() => deleteService(s.id, s.name)} style={{ ...btnSmall, color: "#e53e3e" }}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: 40, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center", color: "#999" }}>
          No services yet. {canManage ? "Create one to get started." : ""}
        </div>
      )}
    </div>
  );
}

const btnBlue = { padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const btnSmall = { padding: "4px 12px", background: "none", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const inputStyle = { padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, flex: 1 };
