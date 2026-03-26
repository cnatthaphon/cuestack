"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "../user-context.js";

export default function TopBar() {
  const { user, org, logout, refresh } = useUser();
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({});
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const profileRef = useRef(null);
  const notifRef = useRef(null);

  // Fetch unread count on mount + interval
  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadNotifications = async () => {
    try {
      const res = await fetch("/api/notifications?limit=10");
      if (res.ok) {
        const d = await res.json();
        setNotifications(d.notifications || []);
        setUnreadCount(d.unread_count || 0);
      }
    } catch {}
  };

  const loadProfile = async () => {
    const res = await fetch("/api/profile");
    if (res.ok) {
      const d = await res.json();
      setProfile(d.profile);
      setProfileForm({
        display_name: d.profile?.display_name || "",
        email: d.profile?.email || "",
        phone: d.profile?.phone || "",
      });
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    setMessage("");
    const body = { ...profileForm };
    if (pwForm.new_password) {
      body.current_password = pwForm.current_password;
      body.new_password = pwForm.new_password;
    }
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setMessage("Saved");
      setPwForm({ current_password: "", new_password: "" });
      refresh();
    } else {
      setMessage((await res.json()).error);
    }
    setSaving(false);
  };

  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    loadNotifications();
  };

  const markRead = async (id) => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    loadNotifications();
  };

  if (!user) return null;

  const typeColors = { info: "#0070f3", success: "#38a169", warning: "#f59e0b", error: "#e53e3e" };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* Notification Bell */}
      <div ref={notifRef} style={{ position: "relative" }}>
        <button onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs) loadNotifications(); }} style={iconBtn}>
          {"\u{1F514}"}
          {unreadCount > 0 && (
            <span style={{
              position: "absolute", top: -2, right: -2, background: "#e53e3e", color: "#fff",
              fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 5px", minWidth: 16, textAlign: "center",
            }}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {showNotifs && (
          <div style={dropdown}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #eee" }}>
              <strong style={{ fontSize: 13 }}>Notifications</strong>
              {unreadCount > 0 && (
                <button onClick={markAllRead} style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", fontSize: 12 }}>
                  Mark all read
                </button>
              )}
            </div>
            <div style={{ maxHeight: 360, overflow: "auto" }}>
              {notifications.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 13 }}>No notifications</div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} onClick={() => !n.is_read && markRead(n.id)} style={{
                    padding: "10px 12px", borderBottom: "1px solid #f5f5f5", cursor: "pointer",
                    background: n.is_read ? "transparent" : "#f0f7ff",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: typeColors[n.type] || "#999", flexShrink: 0 }} />
                      <strong style={{ fontSize: 13 }}>{n.title}</strong>
                    </div>
                    {n.message && <p style={{ margin: "4px 0 0 14px", fontSize: 12, color: "#666" }}>{n.message}</p>}
                    <div style={{ marginTop: 4, marginLeft: 14, fontSize: 11, color: "#999" }}>
                      {n.source && <span>{n.source} &middot; </span>}
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Profile */}
      <div ref={profileRef} style={{ position: "relative" }}>
        <button onClick={() => { setShowProfile(!showProfile); if (!showProfile) loadProfile(); }} style={iconBtn}>
          <span style={{ fontSize: 14 }}>{"\u{1F464}"}</span>
          <span style={{ fontSize: 12, marginLeft: 4 }}>{user.display_name || user.username}</span>
        </button>

        {showProfile && (
          <div style={{ ...dropdown, width: 300 }}>
            <div style={{ padding: 12, borderBottom: "1px solid #eee" }}>
              <strong style={{ fontSize: 14 }}>{profile?.display_name || user.username}</strong>
              <div style={{ fontSize: 12, color: "#666" }}>{user.role_name} &middot; {org?.name}</div>
            </div>
            <div style={{ padding: 12 }}>
              <label style={labelStyle}>Display Name
                <input value={profileForm.display_name || ""} onChange={(e) => setProfileForm({ ...profileForm, display_name: e.target.value })} style={inputStyle} />
              </label>
              <label style={labelStyle}>Email
                <input type="email" value={profileForm.email || ""} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} style={inputStyle} />
              </label>
              <label style={labelStyle}>Phone
                <input value={profileForm.phone || ""} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} style={inputStyle} />
              </label>

              <div style={{ borderTop: "1px solid #eee", marginTop: 8, paddingTop: 8 }}>
                <label style={labelStyle}>Change Password
                  <input type="password" placeholder="Current password" value={pwForm.current_password}
                    onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })} style={inputStyle} autoComplete="current-password" />
                </label>
                <label style={labelStyle}>
                  <input type="password" placeholder="New password (min 8)" value={pwForm.new_password}
                    onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} style={inputStyle} autoComplete="new-password" />
                </label>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={saveProfile} disabled={saving} style={btnBlue}>{saving ? "Saving..." : "Save"}</button>
                <button onClick={logout} style={btnGray}>Logout</button>
              </div>
              {message && <p style={{ margin: "8px 0 0", fontSize: 12, color: message === "Saved" ? "#38a169" : "#e53e3e" }}>{message}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const iconBtn = {
  background: "none", border: "none", cursor: "pointer", position: "relative",
  display: "flex", alignItems: "center", padding: "6px 8px", borderRadius: 6,
  color: "#555", fontSize: 16,
};
const dropdown = {
  position: "absolute", top: "100%", right: 0, marginTop: 4,
  width: 340, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0",
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 50,
};
const labelStyle = { display: "block", fontSize: 12, color: "#666", marginBottom: 6 };
const inputStyle = { display: "block", width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, marginTop: 2, boxSizing: "border-box" };
const btnBlue = { padding: "6px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const btnGray = { padding: "6px 16px", background: "#666", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 };
