"use client";

import { createContext, useContext, useEffect, useState } from "react";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [state, setState] = useState({ user: null, org: null, orgApps: [], orgDashboards: [], loading: true });

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/apps?published=true").then((r) => r.ok ? r.json() : { apps: [] }),
      fetch("/api/dashboards?published=true").then((r) => r.ok ? r.json() : { dashboards: [] }),
    ])
      .then(([meData, appsData, dashData]) => {
        if (!meData.user) {
          window.location.href = "/login";
          return;
        }
        if (meData.user.is_super_admin) {
          window.location.href = "/super";
          return;
        }
        setState({
          user: meData.user,
          org: meData.org,
          orgApps: appsData.apps || [],
          orgDashboards: dashData.dashboards || [],
          loading: false,
        });
      })
      .catch(() => {
        window.location.href = "/login";
      });
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const refresh = async () => {
    const [meRes, appsRes, dashRes] = await Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/apps?published=true").then((r) => r.ok ? r.json() : { apps: [] }),
      fetch("/api/dashboards?published=true").then((r) => r.ok ? r.json() : { dashboards: [] }),
    ]);
    if (meRes.user) {
      setState({
        user: meRes.user,
        org: meRes.org,
        orgApps: appsRes.apps || [],
        orgDashboards: dashRes.dashboards || [],
        loading: false,
      });
    }
  };

  const hasPermission = (perm) => {
    if (!state.user) return false;
    if (state.user.is_super_admin) return true;
    return state.user.permissions?.includes(perm) || false;
  };

  const hasFeature = (feat) => {
    if (!state.user) return false;
    return state.user.features?.includes(feat) || false;
  };

  return (
    <UserContext.Provider value={{ ...state, logout, refresh, hasPermission, hasFeature }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be inside UserProvider");
  return ctx;
}
