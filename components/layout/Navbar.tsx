"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Bell, User, Settings, LogOut, ChevronDown,
  Cpu, Gavel, Users, FileCheck, SlidersHorizontal, BookOpen, Library,
} from "lucide-react";
import { cn } from "@/lib/utils";

// These props are accepted for backward compat but no longer used — nav is always visible
interface NavbarProps {
  backHref?: string;
  backLabel?: string;
  breadcrumbs?: { label: string; href?: string }[];
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

function getNotificationLink(n: NotificationItem): string | null {
  if (n.type === "NEW_APPLICATION") return "/admin/publisher-applications";
  if (n.type === "PUBLISHER_GRANTED") return "/dashboard?tab=mine";
  if (n.type === "APPLICATION_REJECTED") return "/dashboard";
  return null;
}

// Returns handlers and open state for a hover-triggered dropdown.
// A short delay on leave prevents flickering when moving from trigger to content.
function useHoverOpen() {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = () => { if (timer.current) clearTimeout(timer.current); setOpen(true); };
  const leave = () => { timer.current = setTimeout(() => setOpen(false), 120); };
  return { open, setOpen, enter, leave };
}

function BellButton({ authFetch }: { authFetch: (url: string, opts?: RequestInit) => Promise<Response> }) {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const { open, setOpen, enter, leave } = useHoverOpen();

  const fetchNotifications = () => {
    authFetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => {
        setUnread(d.unread ?? 0);
        setNotifications(d.notifications ?? []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchNotifications();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const markAllRead = async () => {
    await authFetch("/api/notifications/mark-all-read", { method: "POST" });
    setUnread(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = async () => {
    await authFetch("/api/notifications", { method: "DELETE" });
    setUnread(0);
    setNotifications([]);
  };

  const markRead = async (id: string) => {
    await authFetch(`/api/notifications/${id}`, { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnread((u) => Math.max(0, u - 1));
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) fetchNotifications(); }}>
      <div onMouseEnter={enter} onMouseLeave={leave} className="relative">
        <PopoverTrigger
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-full text-sm hover:bg-muted transition-colors"
          aria-label="通知"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center font-medium leading-none">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </PopoverTrigger>
      </div>
      <PopoverContent
        className="w-80 !p-0 gap-0"
        side="bottom"
        align="end"
        onMouseEnter={enter}
        onMouseLeave={leave}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-medium">通知</span>
          <div className="flex items-center gap-3">
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                全部已读
              </button>
            )}
            {notifications.length > 0 && (
              <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-destructive hover:underline">
                清除全部
              </button>
            )}
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">暂无通知</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                className={cn(
                  "w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors",
                  !n.read && "bg-blue-50/50",
                )}
                onClick={() => {
                  if (!n.read) markRead(n.id);
                  const link = getNotificationLink(n);
                  if (link) { setOpen(false); router.push(link); }
                }}
              >
                <div className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
                  <div className={cn("flex-1", n.read && "pl-4")}>
                    <p className="text-sm font-medium leading-tight">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {new Date(n.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NavDropdownItem({ href, icon: Icon, children }: { href: string; icon?: React.ElementType; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <DropdownMenuItem
      onClick={() => router.push(href)}
      className="flex items-center gap-2 cursor-pointer"
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </DropdownMenuItem>
  );
}

export function Navbar(_props: NavbarProps) {
  const { user, logout, authFetch } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = user?.role === "ADMIN";
  const canPublish = !!(user?.canPublish || isAdmin);

  const dashHover = useHoverOpen();
  const adminHover = useHoverOpen();
  const userHover = useHoverOpen();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const isDashboard =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/tasks") ||
    pathname.startsWith("/admin/tasks") ||
    pathname.startsWith("/account");
  const isAdminSection =
    pathname.startsWith("/admin/users") ||
    pathname.startsWith("/admin/publisher-applications") ||
    pathname.startsWith("/admin/config") ||
    pathname.startsWith("/admin/llm-configs") ||
    pathname.startsWith("/admin/question-banks");

  return (
    <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Left: logo + primary nav */}
        <div className="flex items-center gap-1.5 min-w-0">
          <Link href="/dashboard" className="flex items-center gap-1.5 shrink-0">
            <span className="text-xl">🏆</span>
            <span className="font-bold text-base tracking-tight">大模型竞技场</span>
          </Link>

          {user && (
            <div className="flex items-center gap-0.5 ml-2">
              {/* 活动广场 */}
              <DropdownMenu open={dashHover.open} onOpenChange={dashHover.setOpen}>
                <div onMouseEnter={dashHover.enter} onMouseLeave={dashHover.leave}>
                  <DropdownMenuTrigger className={cn(
                    "inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm transition-colors hover:bg-muted",
                    isDashboard ? "font-medium text-foreground bg-muted" : "text-muted-foreground",
                  )}>
                    <BookOpen className="h-3.5 w-3.5" />
                    活动广场
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </DropdownMenuTrigger>
                </div>
                <DropdownMenuContent
                  align="start"
                  className="w-40"
                  onMouseEnter={dashHover.enter}
                  onMouseLeave={dashHover.leave}
                >
                  <NavDropdownItem href="/dashboard">我订阅的</NavDropdownItem>
                  <NavDropdownItem href="/dashboard?tab=mine">我发布的</NavDropdownItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* 管理控制台 — admin only */}
              {isAdmin && (
                <DropdownMenu open={adminHover.open} onOpenChange={adminHover.setOpen}>
                  <div onMouseEnter={adminHover.enter} onMouseLeave={adminHover.leave}>
                    <DropdownMenuTrigger className={cn(
                      "inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm transition-colors hover:bg-muted",
                      isAdminSection ? "font-medium text-foreground bg-muted" : "text-muted-foreground",
                    )}>
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      管理控制台
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </DropdownMenuTrigger>
                  </div>
                  <DropdownMenuContent
                    align="start"
                    className="w-44"
                    onMouseEnter={adminHover.enter}
                    onMouseLeave={adminHover.leave}
                  >
                    <NavDropdownItem href="/admin/users" icon={Users}>用户管理</NavDropdownItem>
                    <NavDropdownItem href="/admin/publisher-applications" icon={FileCheck}>发布权限审批</NavDropdownItem>
                    <NavDropdownItem href="/admin/question-banks" icon={Library}>样例题库管理</NavDropdownItem>
                    <NavDropdownItem href="/admin/config" icon={SlidersHorizontal}>系统全局设置</NavDropdownItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>

        {/* Right: bell + user dropdown */}
        {user && (
          <div className="flex items-center gap-1 shrink-0">
            <BellButton authFetch={authFetch} />

            <DropdownMenu open={userHover.open} onOpenChange={userHover.setOpen}>
              <div onMouseEnter={userHover.enter} onMouseLeave={userHover.leave}>
                <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-sm font-medium hover:bg-muted transition-colors">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:block max-w-[120px] truncate">{user.name}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </DropdownMenuTrigger>
              </div>
              <DropdownMenuContent
                align="end"
                className="w-48"
                onMouseEnter={userHover.enter}
                onMouseLeave={userHover.leave}
              >
                <DropdownMenuGroup>
                  <NavDropdownItem href="/account/llm-config" icon={Cpu}>LLM 配置</NavDropdownItem>
                  {canPublish && (
                    <NavDropdownItem href="/account/judge-profiles" icon={Gavel}>评分器设置</NavDropdownItem>
                  )}
                  {canPublish && (
                    <NavDropdownItem href="/account/question-banks" icon={Library}>题库管理</NavDropdownItem>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <NavDropdownItem href="/account/settings" icon={Settings}>账户设置</NavDropdownItem>
                  <DropdownMenuItem
                    className="flex items-center gap-2 text-destructive cursor-pointer"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" />退出登录
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </nav>
  );
}
