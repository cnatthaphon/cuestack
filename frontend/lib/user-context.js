"use client";

import { createContext, useContext, useEffect, useState } from "react";

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [state, setState] = useState({ user: null, org: null, loading: true });

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) {
          window.location.href = "/login";
          return;
        }
        if (d.user.is_super_admin) {
          window.location.href = "/super";
          return;
        }
        setState({ user: d.user, org: d.org, loading: false });
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
    const res = await fetch("/api/auth/me");
    const d = await res.json();
    if (d.user) setState({ user: d.user, org: d.org, loading: false });
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
