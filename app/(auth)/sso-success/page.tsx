"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SSOSuccessPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      router.replace("/login?error=" + encodeURIComponent("SSO 登录失败"));
      return;
    }
    localStorage.setItem("arena_token", token);
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      router.replace("/dashboard");
    } catch {
      router.replace("/dashboard");
    }
  }, []); // eslint-disable-line

  return (
    <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/30">
      <div className="text-center">
        <div className="text-3xl mb-3">🏆</div>
        <p className="text-muted-foreground text-sm">正在登录...</p>
      </div>
    </div>
  );
}
