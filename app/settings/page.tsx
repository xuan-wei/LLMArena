"use client";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user, authFetch } = useAuth();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const changePassword = async () => {
    if (!form.currentPassword || !form.newPassword) return toast.error("请填写当前密码和新密码");
    if (form.newPassword.length < 6) return toast.error("新密码至少 6 位");
    if (form.newPassword !== form.confirmPassword) return toast.error("两次输入的新密码不一致");
    setSaving(true);
    try {
      const res = await authFetch("/api/account/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "修改失败");
      toast.success("密码已修改");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "修改失败");
    } finally {
      setSaving(false);
    }
  };

  const sendResetEmail = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "发送失败");
      toast.success("重置链接已发送至您的邮箱，1 小时内有效");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "发送失败");
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div>
      <Navbar breadcrumbs={[{ label: "账户设置" }]} />
      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold">账户设置</h1>

        <Card>
          <CardHeader>
            <CardTitle>修改密码</CardTitle>
            <CardDescription>当前账号：{user?.name || user?.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>当前密码</Label>
              <Input
                type="password"
                value={form.currentPassword}
                onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                placeholder="输入当前密码"
              />
            </div>
            <div className="space-y-1.5">
              <Label>新密码（至少 6 位）</Label>
              <Input
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                placeholder="输入新密码"
              />
            </div>
            <div className="space-y-1.5">
              <Label>确认新密码</Label>
              <Input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                placeholder="再次输入新密码"
                onKeyDown={(e) => e.key === "Enter" && changePassword()}
              />
            </div>
            <Button className="w-full" onClick={changePassword} disabled={saving}>
              {saving ? "保存中..." : "修改密码"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>通过邮件重置密码</CardTitle>
            <CardDescription>
              忘记当前密码？向 <span className="font-mono">{user?.email}</span> 发送重置链接
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={sendResetEmail} disabled={sendingReset}>
              {sendingReset ? "发送中..." : "发送重置邮件"}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
