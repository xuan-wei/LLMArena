"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export default function ConfigPage() {
  const { user, loading, authFetch } = useAuth();
  const router = useRouter();
  const [welcomeEmail, setWelcomeEmail] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role !== "ADMIN") router.replace("/not-found");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    authFetch("/api/admin/config").then((r) => r.json()).then((d) => {
      setWelcomeEmail(d.config?.welcome_email_enabled === "true");
    });
  }, [user, authFetch]);

  const saveWelcomeEmail = async (enabled: boolean) => {
    setSaving(true);
    try {
      const res = await authFetch("/api/admin/config", {
        method: "PUT",
        body: JSON.stringify({ key: "welcome_email_enabled", value: enabled ? "true" : "false" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setWelcomeEmail(enabled);
      toast.success(enabled ? "已开启欢迎邮件" : "已关闭欢迎邮件");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div><Navbar /></div>;

  return (
    <div>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">系统全局设置</h1>

        <Card>
          <CardHeader>
            <CardTitle>邮件设置</CardTitle>
            <CardDescription>
              邮件服务通过 .env 中的 SMTP 配置启用。若未配置 SMTP，以下开关无效。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
              <div>
                <p className="text-sm font-medium">新用户注册时发送欢迎邮件</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  用户通过邮箱注册成功后，自动发送欢迎邮件
                </p>
              </div>
              <div className="relative shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={welcomeEmail}
                  disabled={saving}
                  onChange={(e) => saveWelcomeEmail(e.target.checked)}
                />
                <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors peer-disabled:opacity-50" />
                <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
              </div>
            </label>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
