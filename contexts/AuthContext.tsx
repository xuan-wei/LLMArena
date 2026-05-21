"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LANGUAGE, normalizeLanguage, tFor, translateJsonMessages, type I18nKey, type I18nParams, type Language } from "@/lib/i18n";

interface User {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "STUDENT";
  canPublish: boolean;
  language: Language;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  publicLanguage: Language;
  locale: string;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setPublicLanguage: (language: Language) => void;
  setLanguage: (language: Language) => Promise<void>;
  t: (key: I18nKey, params?: I18nParams) => string;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [publicLanguage, setPublicLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    setPublicLanguageState(normalizeLanguage(localStorage.getItem("arena_public_language")));
    const stored = localStorage.getItem("arena_token");
    if (stored) {
      setToken(stored);
      fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${stored}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.user) setUser(data.user);
          else {
            localStorage.removeItem("arena_token");
            setToken(null);
          }
        })
        .catch(() => {
          localStorage.removeItem("arena_token");
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const activeLanguage = user?.language ?? publicLanguage;
  const locale = activeLanguage === "zh" ? "zh-CN" : "en-US";

  const setPublicLanguage = (language: Language) => {
    localStorage.setItem("arena_public_language", language);
    setPublicLanguageState(language);
  };

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, language: publicLanguage }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(translateJsonMessages(publicLanguage, data).error || tFor(publicLanguage, "auth.loginFailed"));
    localStorage.setItem("arena_token", data.token);
    setToken(data.token);
    setUser(data.user);
    router.push("/dashboard");
  };

  const register = async (email: string, name: string, password: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password, language: publicLanguage }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(translateJsonMessages(publicLanguage, data).error || tFor(publicLanguage, "auth.registerFailed"));
    localStorage.setItem("arena_token", data.token);
    setToken(data.token);
    setUser(data.user);
    router.push("/dashboard");
  };

  const logout = () => {
    localStorage.removeItem("arena_token");
    setToken(null);
    setUser(null);
    router.push("/login");
  };

  const refreshUser = async () => {
    const stored = localStorage.getItem("arena_token");
    if (!stored) return;
    const data = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${stored}` },
    }).then((r) => r.json());
    if (data.user) setUser(data.user);
  };

  const setLanguage = async (language: Language) => {
    const res = await authFetch("/api/account/preferences", {
      method: "PATCH",
      body: JSON.stringify({ language }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save preferences");
    setUser(data.user);
  };

  // Refresh user data whenever the tab becomes visible so that permission
  // changes made by admins take effect without requiring re-login.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshUser();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Arena-Language": activeLanguage,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return res;
    const data = await res.clone().json().catch(() => null);
    if (!data) return res;
    const translated = JSON.stringify(translateJsonMessages(activeLanguage, data));
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(translated, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  }, [token, activeLanguage]);

  const t = useCallback((key: I18nKey, params?: I18nParams) => tFor(activeLanguage, key, params), [activeLanguage]);

  return (
    <AuthContext.Provider
      value={{ user, token, loading, publicLanguage, locale, login, register, logout, refreshUser, setPublicLanguage, setLanguage, t, authFetch }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
