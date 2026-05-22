"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user, loading, authFetch, setLanguage, t, refreshUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  useEffect(() => {
    if (user?.name) setDisplayName(user.name);
  }, [user?.name]);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const saveDisplayName = async () => {
    if (!displayName.trim()) return toast.error(t("account.settings.nameEmpty"));
    setSavingName(true);
    try {
      const res = await authFetch("/api/account/profile", {
        method: "PUT",
        body: JSON.stringify({ name: displayName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refreshUser();
      toast.success(t("account.settings.nameSaved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("config.saveFailed"));
    } finally {
      setSavingName(false);
    }
  };

  const changePassword = async () => {
    if (!form.currentPassword || !form.newPassword) return toast.error(t("account.settings.fillBoth"));
    if (form.newPassword.length < 6) return toast.error(t("auth.passwordTooShort"));
    if (form.newPassword !== form.confirmPassword) return toast.error(t("account.settings.passwordMismatch"));
    setSaving(true);
    try {
      const res = await authFetch("/api/account/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("account.settings.changeFailed"));
      toast.success(t("account.settings.passwordChanged"));
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("account.settings.changeFailed"));
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
      if (!res.ok) throw new Error(data.error || t("account.settings.sendFailed"));
      toast.success(t("account.settings.resetSent"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("account.settings.sendFailed"));
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div>
      <Navbar backHref="/account" backLabel={t("account.center")} breadcrumbs={[{ label: t("account.settings.title") }]} />
      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold">{t("account.settings.title")}</h1>

        <Card>
          <CardHeader>
            <CardTitle>{t("account.settings.displayName")}</CardTitle>
            <CardDescription>{t("account.settings.displayNameDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("account.settings.displayNamePlaceholder")}
              maxLength={50}
              onKeyDown={(e) => e.key === "Enter" && saveDisplayName()}
            />
            <Button onClick={saveDisplayName} disabled={savingName || displayName.trim() === user?.name}>
              {savingName ? t("common.saving") : t("common.save")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("account.settings.languageTitle")}</CardTitle>
            <CardDescription>{t("account.settings.languageDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              variant={user?.language === "en" ? "default" : "outline"}
              onClick={() => setLanguage("en").then(() => toast.success(t("account.settings.languageSaved"))).catch((e) => toast.error(e instanceof Error ? e.message : t("config.saveFailed")))}
            >
              {t("common.english")}
            </Button>
            <Button
              variant={user?.language === "zh" ? "default" : "outline"}
              onClick={() => setLanguage("zh").then(() => toast.success(t("account.settings.languageSaved"))).catch((e) => toast.error(e instanceof Error ? e.message : t("config.saveFailed")))}
            >
              {t("common.chinese")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("account.settings.password")}</CardTitle>
            <CardDescription>{t("account.settings.currentAccount", { name: user?.name || user?.email })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("account.settings.currentPassword")}</Label>
              <Input
                type="password"
                value={form.currentPassword}
                onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                placeholder={t("account.settings.enterCurrentPassword")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("account.settings.newPassword")}</Label>
              <Input
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                placeholder={t("account.settings.enterNewPassword")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("account.settings.confirmPassword")}</Label>
              <Input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                placeholder={t("account.settings.enterNewPasswordAgain")}
                onKeyDown={(e) => e.key === "Enter" && changePassword()}
              />
            </div>
            <Button className="w-full" onClick={changePassword} disabled={saving}>
              {saving ? t("common.saving") : t("account.settings.changePassword")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("account.settings.resetByEmail")}</CardTitle>
            <CardDescription>
              {t("account.settings.resetDesc", { email: user?.email })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={sendResetEmail} disabled={sendingReset}>
              {sendingReset ? t("account.settings.sending") : t("account.settings.sendReset")}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
