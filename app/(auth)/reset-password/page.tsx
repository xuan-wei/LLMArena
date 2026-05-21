"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { PublicLanguageToggle } from "@/components/auth/PublicLanguageToggle";

function ResetPasswordForm() {
  const { publicLanguage, t } = useAuth();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [form, setForm] = useState({ newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) setErrorMsg(t("auth.invalidResetLink"));
  }, [token, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.newPassword.length < 6) return toast.error(t("auth.passwordTooShort"));
    if (form.newPassword !== form.confirmPassword) return toast.error(t("auth.passwordMismatch"));
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: form.newPassword, language: publicLanguage }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || t("auth.resetFailed"));
      } else {
        setDone(true);
        toast.success(t("auth.passwordResetToast"));
      }
    } catch {
      setErrorMsg(t("auth.networkRetry"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <CardContent className="space-y-4">
      {done ? (
        <div className="space-y-4">
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-700">
            {t("auth.passwordResetSuccess")}
          </div>
          <Link href="/login" className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            {t("auth.goToLogin")}
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
              <Label htmlFor="newPassword">{t("auth.newPassword")}</Label>
              <Input
                id="newPassword"
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                placeholder={t("auth.enterNewPassword")}
                required
                disabled={!token}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                placeholder={t("auth.enterNewPasswordAgain")}
                required
                disabled={!token}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !token}>
              {loading ? t("auth.resetting") : t("auth.confirmReset")}
            </Button>
          </form>
        </>
      )}
    </CardContent>
  );
}

export default function ResetPasswordPage() {
  const { t } = useAuth();
  return (
    <div className="relative flex-1 flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/30">
      <PublicLanguageToggle />
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🏆</div>
          <h1 className="text-2xl font-bold tracking-tight">Arena</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("brand.name")}</p>
        </div>
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t("auth.resetTitle")}</CardTitle>
            <CardDescription>{t("auth.resetDesc")}</CardDescription>
          </CardHeader>
          <Suspense fallback={<CardContent><p className="text-sm text-muted-foreground text-center py-4">{t("common.loading")}</p></CardContent>}>
            <ResetPasswordForm />
          </Suspense>
        </Card>
      </div>
    </div>
  );
}
