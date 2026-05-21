"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { PublicLanguageToggle } from "@/components/auth/PublicLanguageToggle";

interface SSOProvider {
  id: string;
  shortName: string;
  redirectPath: string;
}

export default function LoginPage() {
  const { login, t } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoProviders, setSSOProviders] = useState<SSOProvider[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setErrorMsg(err);

    fetch("/api/auth/sso-providers")
      .then((r) => r.json())
      .then((d) => setSSOProviders(d.providers || []))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

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
            <CardTitle className="text-lg">{t("auth.loginTitle")}</CardTitle>
            <CardDescription>{t("auth.loginDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMsg && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("auth.loggingIn") : t("auth.loginTitle")}
              </Button>
            </form>

            {ssoProviders.length > 0 && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs text-muted-foreground">
                    <span className="bg-white/80 px-2">{t("auth.institutionLogin")}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {ssoProviders.map((p) => (
                    <Button
                      key={p.id}
                      variant="outline"
                      className="w-full text-xs h-9"
                      onClick={() => { window.location.href = p.redirectPath; }}
                    >
                      {p.shortName}
                    </Button>
                  ))}
                </div>
              </>
            )}

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <Link href="/forgot-password" className="hover:underline">
                {t("auth.forgotPassword")}
              </Link>
              <span>
                {t("auth.noAccount")}{" "}
                <Link href="/register" className="text-primary hover:underline font-medium">
                  {t("auth.registerTitle")}
                </Link>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
