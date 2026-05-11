"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [form, setForm] = useState({ newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) setErrorMsg("无效的重置链接，请重新申请。");
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.newPassword.length < 6) return toast.error("密码至少6位");
    if (form.newPassword !== form.confirmPassword) return toast.error("两次密码不一致");
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: form.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "重置失败");
      } else {
        setDone(true);
        toast.success("密码已重置，请登录");
      }
    } catch {
      setErrorMsg("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <CardContent className="space-y-4">
      {done ? (
        <div className="space-y-4">
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-700">
            密码已重置成功！
          </div>
          <Link href="/login" className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            前往登录
          </Link>
        </div>
      ) : (
        <>
          {errorMsg && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorMsg}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">新密码（至少6位）</Label>
              <Input
                id="newPassword"
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                placeholder="输入新密码"
                required
                disabled={!token}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认新密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                placeholder="再次输入新密码"
                required
                disabled={!token}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !token}>
              {loading ? "重置中..." : "确认重置"}
            </Button>
          </form>
        </>
      )}
    </CardContent>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/30">
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🏆</div>
          <h1 className="text-2xl font-bold tracking-tight">Arena</h1>
          <p className="text-muted-foreground text-sm mt-1">大模型竞技场</p>
        </div>
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">重置密码</CardTitle>
            <CardDescription>设置您的新密码</CardDescription>
          </CardHeader>
          <Suspense fallback={<CardContent><p className="text-sm text-muted-foreground text-center py-4">加载中...</p></CardContent>}>
            <ResetPasswordForm />
          </Suspense>
        </Card>
      </div>
    </div>
  );
}
