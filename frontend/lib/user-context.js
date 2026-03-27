"use client";

import { createContext, useContext, useEffect, useState } from "react";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [state, setState] = useState({ user: null, org: null, navData: null, loading: true });

  const loadData = async () => {
    try {
      const [meRes, navRes, pagesRes, sharedRes] = await Promise.all([
        fetch("/api/auth/me").then((r) => r.json()),
        fetch("/api/nav-groups").then((r) => r.ok ? r.json() : { groups: [], dashboards: [], apps: [] }),
        fetch("/api/pages").then((r) => r.ok ? r.json() : { pages: [] }),
        fetch("/api/pages?view=shared").then((r) => r.ok ? r.json() : { pages: [] }),
      ]);
      if (!meRes.user) { window.location.href = "/login"; return null; }
      if (meRes.user.is_super_admin) { window.location.href = "/super"; return null; }
      return {
        user: meRes.user,
        org: meRes.org,
        navData: navRes,
        myPages: pagesRes.pages || [],
        sharedPages: sharedRes.pages || [],
        loading: false,
      };
    } catch {
      window.location.href = "/login";
      return null;
    }
  };

  useEffect(() => {
    loadData().then((d) => { if (d) setState(d); });
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const refresh = async () => {
    const d = await loadData();
    if (d) setState(d);
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
