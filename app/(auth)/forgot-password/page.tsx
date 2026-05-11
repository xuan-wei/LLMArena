"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "请求失败");
      } else {
        setSent(true);
        toast.success("重置邮件已发送");
      }
    } catch {
      setErrorMsg("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

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
            <CardTitle className="text-lg">忘记密码</CardTitle>
            <CardDescription>输入注册邮箱，我们将发送重置链接</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sent ? (
              <div className="space-y-4">
                <div className="rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-700">
                  如果该邮箱已注册，重置链接将在几分钟内发到您的邮箱，请注意查收（含垃圾邮件箱）。
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  <Link href="/login" className="text-primary hover:underline font-medium">
                    返回登录
                  </Link>
                </p>
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
                    <Label htmlFor="email">注册邮箱</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "发送中..." : "发送重置链接"}
                  </Button>
                </form>
                <p className="text-center text-sm text-muted-foreground">
                  想起密码了？{" "}
                  <Link href="/login" className="text-primary hover:underline font-medium">
                    返回登录
                  </Link>
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
