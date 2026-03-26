"use client";

import { createContext, useContext, useEffect, useState } from "react";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [state, setState] = useState({ user: null, org: null, orgApps: [], loading: true });

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/apps?published=true").then((r) => r.ok ? r.json() : { apps: [] }),
    ])
      .then(([meData, appsData]) => {
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
    const [meRes, appsRes] = await Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/apps?published=true").then((r) => r.ok ? r.json() : { apps: [] }),
    ]);
    if (meRes.user) {
      setState({
        user: meRes.user,
        org: meRes.org,
        orgApps: appsRes.apps || [],
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
