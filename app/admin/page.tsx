"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Navbar } from "@/components/layout/Navbar";
import { FileCheck, Library, SlidersHorizontal, Users } from "lucide-react";

export default function AdminPage() {
  const { user, loading, t } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role !== "ADMIN") router.replace("/not-found");
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== "ADMIN") return <div><Navbar /></div>;

  const items = [
    {
      href: "/admin/users",
      title: t("nav.users"),
      desc: t("admin.usersDesc"),
      icon: Users,
    },
    {
      href: "/admin/publisher-applications",
      title: t("nav.publisherApplications"),
      desc: t("admin.publisherApplicationsDesc"),
      icon: FileCheck,
    },
    {
      href: "/admin/question-banks",
      title: t("nav.sampleQuestionBanks"),
      desc: t("admin.questionBanksDesc"),
      icon: Library,
    },
    {
      href: "/admin/config",
      title: t("nav.systemConfig"),
      desc: t("admin.systemConfigDesc"),
      icon: SlidersHorizontal,
    },
  ];

  return (
    <div>
      <Navbar breadcrumbs={[{ label: t("nav.admin") }]} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t("nav.admin")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("admin.consoleDesc")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map(({ href, title, desc, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-lg border border-border/60 bg-white px-5 py-4 transition-all hover:border-primary/25 hover:shadow-sm"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-muted transition-colors group-hover:bg-primary/10">
                <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{desc}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
