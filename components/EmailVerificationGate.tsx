"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export function EmailVerificationGate({ children }: { children: React.ReactNode }) {
  const { user, loading, authFetch, applyToken, refreshUser, logout, t } = useAuth();

  const [mode, setMode] = useState<"verify" | "change">("verify");
  const [step, setStep] = useState<"request" | "code">("request");
  const [captcha, setCaptcha] = useState<{ id: string; svg: string } | null>(null);
  const [captchaText, setCaptchaText] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const gated = !!user && user.role !== "ADMIN" && !user.emailVerified;

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
    if (gated) loadCaptcha();
  }, [gated, loadCaptcha]);

  if (loading || !gated) return <>{children}</>;

  const sendCode = async () => {
    if (!captcha) return;
    setSending(true);
    try {
      const body = mode === "change" ? { newEmail, captchaId: captcha.id, captchaText } : { captchaId: captcha.id, captchaText };
      const res = await authFetch("/api/account/email/send-code", { method: "POST", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep("code");
      const target = mode === "change" ? newEmail : user!.email;
      toast.success(t("verify.codeSent", { email: target }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("verify.sendCode"));
      loadCaptcha();
    } finally {
      setSending(false);
    }
  };

  const confirm = async () => {
    setConfirming(true);
    try {
      const body = mode === "change" ? { code, newEmail } : { code };
      const res = await authFetch("/api/account/email/confirm", { method: "POST", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.token) applyToken(data.token);
      await refreshUser();
      toast.success(mode === "change" ? t("verify.changeSuccess") : t("verify.success"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("verify.confirm"));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("verify.gateTitle")}</CardTitle>
          <CardDescription>{t("verify.gateDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("verify.currentEmail", { email: user!.email })}</p>

          <div className="flex gap-2">
            <Button variant={mode === "verify" ? "default" : "outline"} size="sm" onClick={() => { setMode("verify"); setStep("request"); }}>
              {t("verify.verifyCurrent")}
            </Button>
            <Button variant={mode === "change" ? "default" : "outline"} size="sm" onClick={() => { setMode("change"); setStep("request"); }}>
              {t("verify.wrongEmail")}
            </Button>
          </div>

          {step === "request" ? (
            <div className="space-y-3">
              {mode === "change" && (
                <div className="space-y-1.5">
                  <Label>{t("verify.newEmail")}</Label>
                  <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={t("verify.newEmailPlaceholder")} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t("verify.captchaLabel")}</Label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={loadCaptcha} title={t("verify.resend")} className="shrink-0 border rounded bg-white" dangerouslySetInnerHTML={{ __html: captcha?.svg ?? "" }} />
                  <Input value={captchaText} onChange={(e) => setCaptchaText(e.target.value)} placeholder={t("verify.captchaPlaceholder")} />
                </div>
              </div>
              <Button className="w-full" onClick={sendCode} disabled={sending || !captchaText || (mode === "change" && !newEmail)}>
                {sending ? t("verify.sending") : t("verify.sendCode")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("verify.codeLabel")}</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("verify.codePlaceholder")} maxLength={6} inputMode="numeric" />
              </div>
              <Button className="w-full" onClick={confirm} disabled={confirming || !code}>
                {confirming ? t("verify.sending") : t("verify.confirm")}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => { setStep("request"); loadCaptcha(); }}>
                {t("verify.resend")}
              </Button>
            </div>
          )}

          <div className="pt-2 border-t">
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={logout}>
              {t("verify.logout")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
