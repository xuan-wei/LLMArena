"use client";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type AdminUser = { id: string; name: string; email: string; role: string };

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="relative shrink-0">
      <input type="checkbox" className="sr-only peer" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors peer-disabled:opacity-50" />
      <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
    </div>
  );
}

export default function ConfigPage() {
  const { user, loading, authFetch, t } = useAuth();
  const router = useRouter();
  const [welcomeEmail, setWelcomeEmail] = useState(false);
  const [pubEmailEnabled, setPubEmailEnabled] = useState(false);
  const [pubEmailRecipients, setPubEmailRecipients] = useState<string[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
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
      setPubEmailEnabled(d.config?.publisher_application_email_enabled === "true");
      try {
        const recipients = JSON.parse(d.config?.publisher_application_email_recipients || "[]");
        setPubEmailRecipients(Array.isArray(recipients) ? recipients : []);
      } catch { setPubEmailRecipients([]); }
    });
    authFetch("/api/admin/users").then((r) => r.json()).then((d) => {
      setAdmins((d.users || []).filter((u: AdminUser) => u.role === "ADMIN"));
    });
  }, [user, authFetch]);

  const saveConfig = useCallback(async (key: string, value: string) => {
    const res = await authFetch("/api/admin/config", {
      method: "PUT",
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
  }, [authFetch]);

  const saveWelcomeEmail = async (enabled: boolean) => {
    setSaving(true);
    try {
      await saveConfig("welcome_email_enabled", enabled ? "true" : "false");
      setWelcomeEmail(enabled);
      toast.success(t(enabled ? "config.welcomeEmailOn" : "config.welcomeEmailOff"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("config.saveFailed"));
    } finally { setSaving(false); }
  };

  const savePubEmailEnabled = async (enabled: boolean) => {
    setSaving(true);
    try {
      await saveConfig("publisher_application_email_enabled", enabled ? "true" : "false");
      setPubEmailEnabled(enabled);
      toast.success(t(enabled ? "config.pubAppEmailOn" : "config.pubAppEmailOff"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("config.saveFailed"));
    } finally { setSaving(false); }
  };

  const toggleRecipient = (id: string) => {
    setPubEmailRecipients((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const saveRecipients = async () => {
    setSaving(true);
    try {
      await saveConfig("publisher_application_email_recipients", JSON.stringify(pubEmailRecipients));
      toast.success(t("config.recipientsSaved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("config.saveFailed"));
    } finally { setSaving(false); }
  };

  if (loading) return <div><Navbar /></div>;

  return (
    <div>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">{t("config.title")}</h1>

        <Card>
          <CardHeader>
            <CardTitle>{t("config.emailSettings")}</CardTitle>
            <CardDescription>{t("config.emailSettingsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
              <div>
                <p className="text-sm font-medium">{t("config.welcomeEmail")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("config.welcomeEmailDesc")}</p>
              </div>
              <Toggle checked={welcomeEmail} disabled={saving} onChange={saveWelcomeEmail} />
            </label>

            <div className="border-t pt-4">
              <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
                <div>
                  <p className="text-sm font-medium">{t("config.pubAppEmail")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("config.pubAppEmailDesc")}</p>
                </div>
                <Toggle checked={pubEmailEnabled} disabled={saving} onChange={savePubEmailEnabled} />
              </label>

              {pubEmailEnabled && (
                <div className="mt-3 ml-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{t("config.selectRecipients")}</p>
                    <div className="flex gap-2">
                      <button className="text-xs text-primary hover:underline" onClick={() => setPubEmailRecipients(admins.map((a) => a.id))}>{t("config.selectAll")}</button>
                      <button className="text-xs text-primary hover:underline" onClick={() => setPubEmailRecipients([])}>{t("config.deselectAll")}</button>
                    </div>
                  </div>
                  {admins.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("config.noAdmins")}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {admins.map((admin) => (
                        <label key={admin.id} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300"
                            checked={pubEmailRecipients.includes(admin.id)}
                            onChange={() => toggleRecipient(admin.id)}
                          />
                          <span className="text-sm">{admin.name}</span>
                          <span className="text-xs text-muted-foreground">{admin.email}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <Button size="sm" disabled={saving} onClick={saveRecipients}>
                    {saving ? t("common.saving") : t("config.saveRecipients")}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
