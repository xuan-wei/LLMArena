"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface Stats {
  visits: number;
  users: number;
  online: number;
}

export function Footer({ copyright, icp }: { copyright?: string; icp?: string }) {
  const { user, loading, publicLanguage } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const language = user?.language ?? publicLanguage;

  useEffect(() => {
    if (loading) return; // wait for auth to resolve before first ping

    const controller = new AbortController();

    const ping = (countVisit: boolean) => {
      fetch("/api/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.id ?? null, countVisit }),
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((d) => setStats(d))
        .catch(() => {});
    };

    ping(true);
    const interval = setInterval(() => ping(false), 60000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [loading, user?.id]);

  if (!copyright && !icp) return null;
  const locale = language === "zh" ? "zh-CN" : "en-US";

  return (
    <footer className="border-t py-4 text-center text-xs text-muted-foreground">
      <p>
        {copyright && <>© {new Date().getFullYear()} {copyright}. All rights reserved.</>}
        {copyright && icp && <span className="mx-2">·</span>}
        {icp && (
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="hover:underline">
            {icp}
          </a>
        )}
        {stats && (
          <>
            <span className="mx-2">·</span>
            {language === "zh" ? "访问" : "Visits"} {stats.visits.toLocaleString(locale)}
            <span className="mx-1.5">·</span>
            {language === "zh" ? "注册" : "Users"} {stats.users.toLocaleString(locale)}
            <span className="mx-1.5">·</span>
            {language === "zh" ? "在线" : "Online"} {stats.online}
          </>
        )}
      </p>
    </footer>
  );
}
