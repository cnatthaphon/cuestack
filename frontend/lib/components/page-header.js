"use client";

import Link from "next/link";

/**
 * Consistent page header with title, description, and action button.
 * Props: title, description, backHref, backLabel, action (JSX)
 */
export default function PageHeader({ title, description, backHref, backLabel, action }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {backHref && (
        <Link href={backHref} style={{ color: "#666", textDecoration: "none", fontSize: 13, display: "inline-block", marginBottom: 8 }}>
          &larr; {backLabel || "Back"}
        </Link>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
          {description && <p style={{ color: "#666", fontSize: 13, margin: "4px 0 0" }}>{description}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}

/**
 * Form card wrapper — consistent styling for create/edit forms.
 */
export function FormCard({ title, children, onSubmit }) {
  const inner = (
    <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 24 }}>
      {title && <h2 style={{ margin: "0 0 16px", fontSize: 16 }}>{title}</h2>}
      {children}
    </div>
  );
  if (onSubmit) return <form onSubmit={onSubmit}>{inner}</form>;
  return inner;
}

/**
 * Form field grid — 2-column grid for form fields.
 */
export function FieldGrid({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>{children}</div>;
}

/**
 * Consistent form field label + input.
 */
export function Field({ label, children, full }) {
  return (
    <label style={{ display: "block", fontSize: 13, color: "#555", ...(full ? { gridColumn: "1 / -1" } : {}) }}>
      {label}
      {children}
    </label>
  );
}

// Shared styles
export const inputStyle = { display: "block", width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, marginTop: 4, boxSizing: "border-box" };
export const btnPrimary = { padding: "8px 20px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
export const btnSecondary = { padding: "8px 20px", background: "#666", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, textDecoration: "none" };
export const btnDanger = { padding: "8px 20px", background: "#e53e3e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 };
