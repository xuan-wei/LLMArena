"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Navbar } from "@/components/layout/Navbar";
import { FileCheck, Library, SlidersHorizontal, Users } from "lucide-react";

const items = [
  {
    href: "/admin/users",
    title: "用户管理",
    desc: "管理用户角色、发布权限和账号状态",
    icon: Users,
  },
  {
    href: "/admin/publisher-applications",
    title: "发布权限审批",
    desc: "审核教师或发布者提交的活动发布申请",
    icon: FileCheck,
  },
  {
    href: "/admin/question-banks",
    title: "样例题库管理",
    desc: "维护可供教师导入的公共样例题库",
    icon: Library,
  },
  {
    href: "/admin/config",
    title: "系统全局设置",
    desc: "配置站点公告、页脚等全局参数",
    icon: SlidersHorizontal,
  },
];

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role !== "ADMIN") router.replace("/not-found");
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== "ADMIN") return <div><Navbar /></div>;

  return (
    <div>
      <Navbar breadcrumbs={[{ label: "管理控制台" }]} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">管理控制台</h1>
          <p className="mt-1 text-sm text-muted-foreground">集中查看用户、审批、样例题库和全局设置入口。</p>
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
