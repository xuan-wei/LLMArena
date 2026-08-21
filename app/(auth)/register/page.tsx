"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { PublicLanguageToggle } from "@/components/auth/PublicLanguageToggle";

export default function RegisterPage() {
  const { register, t, publicLanguage } = useAuth();
  const [step, setStep] = useState<"details" | "code">("details");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState<{ id: string; svg: string } | null>(null);
  const [captchaText, setCaptchaText] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadCaptcha = useCallback(async () => {
    setCaptchaText("");
    try {
      const res = await fetch("/api/captcha");
      const data = await res.json();
      setCaptcha({ id: data.id, svg: data.svg });
    } catch {
      setCaptcha(null);
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) return toast.error(t("auth.registerRequired"));
    if (password.length < 6) return toast.error(t("auth.passwordTooShort"));
    if (!captcha || !captchaText) return toast.error(t("api.captchaRequired"));
    setSending(true);
    try {
      const res = await fetch("/api/auth/register/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, captchaId: captcha.id, captchaText, language: publicLanguage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep("code");
      toast.success(t("verify.codeSent", { email }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("verify.sendCode"));
      loadCaptcha();
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(email, name, password, code);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("auth.registerFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex-1 flex items-center justify-center bg-muted/30">
      <PublicLanguageToggle />
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">🏆 Arena</CardTitle>
          <CardDescription>{t("auth.registerTitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === "details" ? (
            <form onSubmit={sendCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("auth.name")}</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("auth.namePlaceholder")} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.passwordWithMin")}</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" required minLength={6} />
              </div>
              <div className="space-y-2">
                <Label>{t("verify.captchaLabel")}</Label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={loadCaptcha} title={t("verify.resend")} className="shrink-0 border rounded bg-white" dangerouslySetInnerHTML={{ __html: captcha?.svg ?? "" }} />
                  <Input value={captchaText} onChange={(e) => setCaptchaText(e.target.value)} placeholder={t("verify.captchaPlaceholder")} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("auth.registerVerifyDesc")}</p>
              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? t("verify.sending") : t("verify.sendCode")}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("verify.codeSent", { email })}</p>
              <div className="space-y-2">
                <Label htmlFor="code">{t("verify.codeLabel")}</Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("verify.codePlaceholder")} maxLength={6} inputMode="numeric" required />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !code}>
                {loading ? t("auth.registering") : t("auth.registerTitle")}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep("details"); loadCaptcha(); }}>
                {t("common.back")}
              </Button>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("auth.haveAccount")}{" "}
            <Link href="/login" className="underline">
              {t("auth.loginTitle")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
