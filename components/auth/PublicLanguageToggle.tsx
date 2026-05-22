"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import type { Language } from "@/lib/i18n";

export function PublicLanguageToggle() {
  const { user, publicLanguage, setPublicLanguage, setLanguage, t } = useAuth();
  const language = user?.language ?? publicLanguage;

  const switchLanguage = (next: Language) => {
    setPublicLanguage(next);
    if (user && user.language !== next) {
      setLanguage(next).catch(() => {});
    }
  };

  return (
    <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full border bg-white/80 p-1 shadow-sm backdrop-blur-sm" aria-label={t("auth.languageToggleLabel")}>
      <Languages className="ml-2 size-4 text-muted-foreground" />
      <Button
        type="button"
        size="sm"
        variant={language === "zh" ? "default" : "ghost"}
        className="h-7 rounded-full px-3"
        onClick={() => switchLanguage("zh")}
      >
        中文
      </Button>
      <Button
        type="button"
        size="sm"
        variant={language === "en" ? "default" : "ghost"}
        className="h-7 rounded-full px-3"
        onClick={() => switchLanguage("en")}
      >
        English
      </Button>
    </div>
  );
}
