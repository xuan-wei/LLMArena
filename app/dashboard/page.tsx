"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

interface Task {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  createdBy: string | null;
  isEnrolled: boolean;
  subscribeCode: string | null;
  subscribeCodeEnabled: boolean;
  _count: { questions: number; enrollments: number };
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  DRAFT:       { label: "草稿",   className: "bg-slate-100 text-slate-500 border-slate-200" },
  PRELIMINARY: { label: "海选中", className: "bg-amber-50 text-amber-700 border-amber-200" },
  FINALS:      { label: "终赛",   className: "bg-rose-50 text-rose-700 border-rose-200" },
  ENDED:       { label: "已结束", className: "bg-slate-100 text-slate-500 border-slate-200" },
};



export default function DashboardPage() {
  return <Suspense><DashboardContent /></Suspense>;
}

function DashboardContent() {
  const { user, loading, authFetch, refreshUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const refreshedRef = useRef(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [fetching, setFetching] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") === "mine" ? "mine" : "subscribed");

  // Subscribe dialog
  const [subOpen, setSubOpen] = useState(false);
  const [subCode, setSubCode] = useState("");
  const [subLoading, setSubLoading] = useState(false);

  // Publisher apply dialog
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyData, setApplyData] = useState({ institution: "", homepage: "", purpose: "" });
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyStatus, setApplyStatus] = useState<{ status: string; rejectReason?: string | null } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [subscribedStatusFilter, setSubscribedStatusFilter] = useState<string>("ALL");
  const [subPage, setSubPage] = useState(1);
  const [minePage, setMinePage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  const loadTasks = () => {
    if (!user) return;
    authFetch("/api/tasks")
      .then((r) => r.json())
      .then((data) => setTasks(data.tasks || []))
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    if (user) {
      loadTasks();
      // Load publisher application status for non-publishers
      if (!user.canPublish && user.role !== "ADMIN") {
        authFetch("/api/publisher/application")
          .then((r) => r.json())
          .then((data) => {
            const app = data.application;
            setApplyStatus(app ? { status: app.status, rejectReason: app.rejectReason } : null);
            // If approved but in-memory user state is stale, refresh once from DB
            if (app?.status === "APPROVED" && !refreshedRef.current) {
              refreshedRef.current = true;
              refreshUser();
            }
          });
      }
    }
  }, [user]); // eslint-disable-line

  const handleUnsubscribe = async (taskId: string) => {
    if (!confirm("确定退订该活动？提交记录将保留，但活动将从列表消失。")) return;
    const res = await authFetch(`/api/tasks/${taskId}/unsubscribe`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || "退订失败");
    toast.success("已退订");
    loadTasks();
  };

  const handleSubscribe = async () => {
    if (!/^\d{6}$/.test(subCode.trim())) return toast.error("请输入6位数字订阅码");
    setSubLoading(true);
    try {
      const res = await authFetch("/api/tasks/subscribe", { method: "POST", body: JSON.stringify({ code: subCode.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "订阅失败");
      toast.success(`已成功订阅「${data.task.title}」`);
      setSubOpen(false);
      setSubCode("");
      loadTasks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "订阅失败");
    } finally {
      setSubLoading(false);
    }
  };

  const handleApply = async () => {
    if (!applyData.institution || !applyData.purpose) return toast.error("机构和申请用途不能为空");
    setApplyLoading(true);
    try {
      const res = await authFetch("/api/publisher/apply", { method: "POST", body: JSON.stringify(applyData) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "申请失败");
      toast.success("申请已提交，等待管理员审核");
      setApplyOpen(false);
      setApplyStatus({ status: "PENDING" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "申请失败");
    } finally {
      setApplyLoading(false);
    }
  };

  useEffect(() => {
    const tab = searchParams.get("tab") === "mine" ? "mine" : "subscribed";
    setActiveTab(tab);
  }, [searchParams]);

  if (loading || fetching) return <div><Navbar /></div>;

  const canPublish = user?.role === "ADMIN" || user?.canPublish;
  const subscribedTasks = tasks.filter((t) => t.isEnrolled && t.createdBy !== user?.id);
  const filteredSubscribedTasks = subscribedStatusFilter === "ALL" ? subscribedTasks : subscribedTasks.filter((t) => t.status === subscribedStatusFilter);
  const subTotalPages = Math.ceil(filteredSubscribedTasks.length / PAGE_SIZE);
  const pagedSubscribedTasks = filteredSubscribedTasks.slice((subPage - 1) * PAGE_SIZE, subPage * PAGE_SIZE);

  const myTasks = tasks.filter((t) => t.createdBy === user?.id);
  const filteredMyTasks = statusFilter === "ALL" ? myTasks : myTasks.filter((t) => t.status === statusFilter);
  const mineTotalPages = Math.ceil(filteredMyTasks.length / PAGE_SIZE);
  const pagedMyTasks = filteredMyTasks.slice((minePage - 1) * PAGE_SIZE, minePage * PAGE_SIZE);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    router.replace(val === "mine" ? "/dashboard?tab=mine" : "/dashboard");
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("确定要删除该活动吗？此操作不可恢复，所有题目、报名和提交记录将一并删除。")) return;
    try {
      const res = await authFetch(`/api/admin/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "删除失败");
        return;
      }
      toast.success("活动已删除");
      loadTasks();
    } catch {
      toast.error("删除失败，请稍后重试");
    }
  };

  const handleCloneTask = async (taskId: string) => {
    try {
      const res = await authFetch(`/api/admin/tasks/${taskId}/clone`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "克隆失败");
        return;
      }
      toast.success("活动已克隆");
      loadTasks();
    } catch {
      toast.error("克隆失败，请稍后重试");
    }
  };

  return (
    <div>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold mb-6">活动广场</h1>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-4">
            <TabsTrigger value="subscribed">我订阅的 ({subscribedTasks.length})</TabsTrigger>
            <TabsTrigger value="mine">我发布的 {canPublish ? `(${myTasks.length})` : ""}</TabsTrigger>
          </TabsList>

          {/* Subscribed tab */}
          <TabsContent value="subscribed">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <div className="flex items-center gap-1 flex-wrap">
                {[
                  { key: "ALL", label: "全部" },
                  { key: "PRELIMINARY", label: "海选中" },
                  { key: "FINALS", label: "终赛" },
                  { key: "ENDED", label: "已结束" },
                ].map(({ key, label }) => {
                  const count = key === "ALL" ? subscribedTasks.length : subscribedTasks.filter((t) => t.status === key).length;
                  return (
                    <button
                      key={key}
                      onClick={() => { setSubscribedStatusFilter(key); setSubPage(1); }}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        subscribedStatusFilter === key
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {label}{count > 0 && ` (${count})`}
                    </button>
                  );
                })}
              </div>
              <Button size="sm" onClick={() => setSubOpen(true)}>+ 输入订阅码</Button>
            </div>
            {subscribedTasks.length === 0 ? (
              <p className="text-muted-foreground text-center py-16">还未订阅任何活动，输入订阅码加入</p>
            ) : filteredSubscribedTasks.length === 0 ? (
              <p className="text-muted-foreground text-center py-16">没有符合条件的活动</p>
            ) : (
              <div className="rounded-xl border border-border/60 overflow-hidden bg-white">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="font-medium">活动名称</TableHead>
                      <TableHead className="w-24 font-medium">状态</TableHead>
                      <TableHead className="w-16 text-center font-medium">题目</TableHead>
                      <TableHead className="w-32 font-medium">创建时间</TableHead>
                      <TableHead className="w-28" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedSubscribedTasks.map((task) => {
                      const s = STATUS_STYLES[task.status];
                      return (
                        <TableRow key={task.id}>
                          <TableCell className="font-medium">{task.title}</TableCell>
                          <TableCell>
                            {s && <Badge variant="outline" className={`${s.className} text-xs`}>{s.label}</Badge>}
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">{task._count.questions}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(task.createdAt).toLocaleDateString("zh-CN")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button size="sm" className="h-7 px-2 text-xs"
                                onClick={() => router.push(`/tasks/${task.id}`)}>进入</Button>
                              {task.status === "PRELIMINARY" && (
                                <Button size="sm" variant="ghost"
                                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => handleUnsubscribe(task.id)}>退订</Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {subTotalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <Button variant="outline" size="sm" onClick={() => setSubPage((p) => p - 1)} disabled={subPage <= 1}>上一页</Button>
                <span className="text-sm text-muted-foreground">第 {subPage} / {subTotalPages} 页</span>
                <Button variant="outline" size="sm" onClick={() => setSubPage((p) => p + 1)} disabled={subPage >= subTotalPages}>下一页</Button>
              </div>
            )}
          </TabsContent>

          {/* My published tasks tab */}
          <TabsContent value="mine">
            {canPublish ? (
              <>
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  {/* Status filter */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {[
                      { key: "ALL", label: "全部" },
                      { key: "DRAFT", label: "草稿" },
                      { key: "PRELIMINARY", label: "海选中" },
                      { key: "FINALS", label: "终赛" },
                      { key: "ENDED", label: "已结束" },
                    ].map(({ key, label }) => {
                      const count = key === "ALL" ? myTasks.length : myTasks.filter((t) => t.status === key).length;
                      return (
                        <button
                          key={key}
                          onClick={() => { setStatusFilter(key); setMinePage(1); }}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            statusFilter === key
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {label}{count > 0 && ` (${count})`}
                        </button>
                      );
                    })}
                  </div>
                  <Link href="/admin/tasks/new">
                    <Button size="sm">+ 创建活动</Button>
                  </Link>
                </div>

                {filteredMyTasks.length === 0 ? (
                  <p className="text-muted-foreground text-center py-16">
                    {myTasks.length === 0 ? "还没有发布活动" : "没有符合条件的活动"}
                  </p>
                ) : (<>
                  <div className="rounded-xl border border-border/60 overflow-hidden bg-white">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="font-medium">活动名称</TableHead>
                          <TableHead className="w-24 font-medium">状态</TableHead>
                          <TableHead className="w-16 text-center font-medium">题目</TableHead>
                          <TableHead className="w-20 text-center font-medium">订阅人数</TableHead>
                          <TableHead className="w-24 font-medium">订阅码</TableHead>
                          <TableHead className="w-32 font-medium">创建时间</TableHead>
                          <TableHead className="w-28" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedMyTasks.map((task) => {
                          const s = STATUS_STYLES[task.status];
                          return (
                            <TableRow key={task.id}>
                              <TableCell className="font-medium">{task.title}</TableCell>
                              <TableCell>
                                {s && <Badge variant="outline" className={`${s.className} text-xs`}>{s.label}</Badge>}
                              </TableCell>
                              <TableCell className="text-center text-sm text-muted-foreground">{task._count.questions}</TableCell>
                              <TableCell className="text-center text-sm text-muted-foreground">{task._count.enrollments}</TableCell>
                              <TableCell className="font-mono text-sm">
                                {task.subscribeCode ? (
                                  <button
                                    title="点击复制"
                                    className={`hover:opacity-70 transition-opacity cursor-pointer ${task.subscribeCodeEnabled ? "text-primary" : "text-muted-foreground line-through"}`}
                                    onClick={() => {
                                      const code = task.subscribeCode!;
                                      if (navigator.clipboard?.writeText) {
                                        navigator.clipboard.writeText(code).then(() => toast.success("已复制订阅码"));
                                      } else {
                                        const el = document.createElement("textarea");
                                        el.value = code;
                                        document.body.appendChild(el);
                                        el.select();
                                        document.execCommand("copy");
                                        document.body.removeChild(el);
                                        toast.success("已复制订阅码");
                                      }
                                    }}
                                  >{task.subscribeCode}</button>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {new Date(task.createdAt).toLocaleDateString("zh-CN")}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => router.push(`/admin/tasks/${task.id}`)}
                                  >详情</Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => handleCloneTask(task.id)}
                                  >克隆</Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDeleteTask(task.id)}
                                  >删除</Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {mineTotalPages > 1 && (
                    <div className="flex items-center justify-center gap-3 mt-4">
                      <Button variant="outline" size="sm" onClick={() => setMinePage((p) => p - 1)} disabled={minePage <= 1}>上一页</Button>
                      <span className="text-sm text-muted-foreground">第 {minePage} / {mineTotalPages} 页</span>
                      <Button variant="outline" size="sm" onClick={() => setMinePage((p) => p + 1)} disabled={minePage >= mineTotalPages}>下一页</Button>
                    </div>
                  )}
                </>)}
              </>
            ) : (
              <div className="py-6 space-y-4 max-w-md mx-auto">
                {applyStatus?.status === "PENDING" ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700 space-y-1">
                    <p className="font-medium">申请已提交，等待管理员审核</p>
                    <p className="text-amber-600">审核通过后页面将自动刷新，届时即可创建活动。</p>
                  </div>
                ) : applyStatus?.status === "REJECTED" ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm space-y-3">
                    <p className="font-medium text-red-700">申请已被拒绝</p>
                    <p className="text-red-600">原因：{applyStatus.rejectReason || "无说明"}</p>
                    <Button onClick={() => setApplyOpen(true)} variant="outline" size="sm">重新申请</Button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-white px-6 py-6 text-center space-y-3">
                    <p className="font-medium">申请发布权限</p>
                    <p className="text-sm text-muted-foreground">获得权限后即可创建活动、管理题目和查看参与者</p>
                    <Button onClick={() => setApplyOpen(true)}>申请发布权限</Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Subscribe dialog */}
      <Dialog open={subOpen} onOpenChange={setSubOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>输入订阅码</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label>6位数字订阅码</Label>
              <Input
                placeholder="000000"
                maxLength={6}
                value={subCode}
                onChange={(e) => setSubCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && handleSubscribe()}
                className="font-mono text-lg tracking-widest text-center"
              />
            </div>
            <Button className="w-full" onClick={handleSubscribe} disabled={subLoading}>
              {subLoading ? "订阅中..." : "订阅"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Apply publisher dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>申请发布权限</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label>机构 / 单位 *</Label>
              <Input placeholder="如：上海交通大学" value={applyData.institution}
                onChange={(e) => setApplyData({ ...applyData, institution: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>主页链接（选填）</Label>
              <Input placeholder="https://..." value={applyData.homepage}
                onChange={(e) => setApplyData({ ...applyData, homepage: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>申请用途 *</Label>
              <Textarea placeholder="请简述您的使用场景..." rows={3} value={applyData.purpose}
                onChange={(e) => setApplyData({ ...applyData, purpose: e.target.value })} />
            </div>
            <Button className="w-full" onClick={handleApply} disabled={applyLoading}>
              {applyLoading ? "提交中..." : "提交申请"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
