"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export function ChangeEmailCard() {
  const { user, authFetch, applyToken, refreshUser, t } = useAuth();
  const [flow, setFlow] = useState<"idle" | "request" | "code">("idle");
  const [captcha, setCaptcha] = useState<{ id: string; svg: string } | null>(null);
  const [captchaText, setCaptchaText] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

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
    if (flow === "request") loadCaptcha();
  }, [flow, loadCaptcha]);

  const reset = () => { setFlow("idle"); setNewEmail(""); setCode(""); setCaptchaText(""); };

  const sendCode = async () => {
    if (!newEmail || !captcha || !captchaText) return;
    setSending(true);
    try {
      const res = await authFetch("/api/account/email/send-code", {
        method: "POST",
        body: JSON.stringify({ newEmail, captchaId: captcha.id, captchaText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFlow("code");
      toast.success(t("verify.codeSent", { email: newEmail }));
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
      const res = await authFetch("/api/account/email/confirm", {
        method: "POST",
        body: JSON.stringify({ code, newEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.token) applyToken(data.token);
      await refreshUser();
      toast.success(t("verify.changeSuccess"));
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("verify.confirm"));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("account.settings.email")}</CardTitle>
        <CardDescription>{t("account.settings.emailDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{user?.email}</span>
          {user?.emailVerified ? (
            <span className="text-green-600">{t("account.settings.emailVerifiedBadge")}</span>
          ) : (
            <span className="text-amber-600">{t("account.settings.emailUnverifiedBadge")}</span>
          )}
        </div>

        {flow === "idle" && (
          <Button variant="outline" onClick={() => setFlow("request")}>
            {t("account.settings.changeEmail")}
          </Button>
        )}

        {flow === "request" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("verify.newEmail")}</Label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={t("verify.newEmailPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("verify.captchaLabel")}</Label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={loadCaptcha} title={t("verify.resend")} className="shrink-0 border rounded bg-white" dangerouslySetInnerHTML={{ __html: captcha?.svg ?? "" }} />
                <Input value={captchaText} onChange={(e) => setCaptchaText(e.target.value)} placeholder={t("verify.captchaPlaceholder")} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={sendCode} disabled={sending || !newEmail || !captchaText}>
                {sending ? t("verify.sending") : t("verify.sendCode")}
              </Button>
              <Button variant="ghost" onClick={reset}>{t("common.cancel")}</Button>
            </div>
          </div>
        )}

        {flow === "code" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("verify.codeSent", { email: newEmail })}</p>
            <div className="space-y-1.5">
              <Label>{t("verify.codeLabel")}</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("verify.codePlaceholder")} maxLength={6} inputMode="numeric" />
            </div>
            <div className="flex gap-2">
              <Button onClick={confirm} disabled={confirming || !code}>
                {confirming ? t("verify.sending") : t("verify.confirm")}
              </Button>
              <Button variant="ghost" onClick={reset}>{t("common.cancel")}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
