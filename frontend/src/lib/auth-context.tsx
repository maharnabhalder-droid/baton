"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { apiRequest } from "./api";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "approver" | "incoming" | "restricted";
  mfa_enabled: boolean;
  needs_password_reset: boolean;
  is_demo: boolean;
}

export function clearBatonSessionStorage() {
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith("baton_")) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  tryDemo: (role: "approver" | "incoming" | "restricted") => Promise<{ project_id: string; message: string }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refreshUser: async () => {},
  logout: async () => {},
  tryDemo: async () => ({ project_id: "", message: "" }),
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchUser = async () => {
    try {
      const data = await apiRequest<User>("/api/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const logout = async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } finally {
      clearBatonSessionStorage();
      setUser(null);
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    }
  };

  const tryDemo = async (role: "approver" | "incoming" | "restricted") => {
    clearBatonSessionStorage();
    const res = await apiRequest<{ project_id: string; message: string }>("/api/auth/demo", {
      method: "POST",
      data: { role },
    });
    await fetchUser();
    return res;
  };

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser: fetchUser, logout, tryDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
