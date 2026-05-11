"use client";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import Link from "next/link";
import { Cpu, Gavel, Settings, BookOpen } from "lucide-react";

export default function AccountPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading) return <div><Navbar /></div>;

  const canPublish = user?.role === "ADMIN" || user?.canPublish;

  const items = [
    {
      href: "/account/llm-config",
      icon: Cpu,
      title: "LLM 配置",
      desc: "管理用于 Chatbot 接入的 API 密钥和模型列表",
      show: true,
    },
    {
      href: "/account/judge-profiles",
      icon: Gavel,
      title: "评分器设置",
      desc: "配置用于自动评分的 LLM 提供商、模型和评分提示词",
      show: canPublish,
    },
    {
      href: "/account/question-banks",
      icon: BookOpen,
      title: "题库管理",
      desc: "管理个人题库，浏览样例题库，快速导入题目到活动中",
      show: canPublish,
    },
    {
      href: "/account/settings",
      icon: Settings,
      title: "账户设置",
      desc: "修改密码、通过邮件重置密码",
      show: true,
    },
  ].filter((item) => item.show);

  return (
    <div>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-2">账户中心</h1>
        <p className="text-muted-foreground text-sm mb-8">{user?.name} · {user?.email}</p>
        <div className="grid gap-3">
          {items.map(({ href, icon: Icon, title, desc }) => (
            <Link
              key={href}
              href={href}
              className="group bg-white rounded-xl border border-border/60 px-6 py-5 flex items-center gap-5 hover:shadow-md hover:border-primary/20 transition-all"
            >
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
              <div className="ml-auto text-muted-foreground/40 group-hover:text-primary/60 transition-colors">›</div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
