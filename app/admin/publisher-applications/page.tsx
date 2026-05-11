"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Application {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  institution: string;
  homepage: string | null;
  purpose: string;
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: { id: string; email: string; name: string; institution: string | null };
  reviewer: { name: string } | null;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  PENDING:  { label: "待审核", className: "bg-amber-50 text-amber-700 border-amber-200" },
  APPROVED: { label: "已通过", className: "bg-green-50 text-green-700 border-green-200" },
  REJECTED: { label: "已拒绝", className: "bg-red-50 text-red-700 border-red-200" },
};

const PAGE_SIZE = 20;

export default function PublisherApplicationsPage() {
  const { user, loading, authFetch } = useAuth();
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fetching, setFetching] = useState(true);

  // Dialog state
  const [selected, setSelected] = useState<Application | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role !== "ADMIN") router.replace("/not-found");
    }
  }, [user, loading, router]);

  const load = (p: number) => {
    setFetching(true);
    authFetch(`/api/admin/publisher-applications?page=${p}&pageSize=${PAGE_SIZE}`)
      .then((r) => r.json())
      .then((data) => {
        setApplications(data.applications || []);
        setTotal(data.total ?? 0);
      })
      .finally(() => setFetching(false));
  };

  useEffect(() => { if (user) load(page); }, [user]); // eslint-disable-line

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handlePage = (p: number) => {
    setPage(p);
    load(p);
  };

  const openDialog = (app: Application) => {
    setSelected(app);
    setShowRejectForm(false);
    setRejectReason("");
  };

  const act = async (action: "approve" | "reject") => {
    if (!selected) return;
    setProcessing(true);
    try {
      const res = await authFetch(`/api/admin/publisher-applications/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, rejectReason: action === "reject" ? rejectReason : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作失败");
      toast.success(action === "approve" ? "已通过，发布权限已授予" : "已拒绝");
      setSelected(null);
      load(page);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div><Navbar /></div>;

  return (
    <div>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">发布权限申请</h1>

        {fetching ? (
          <p className="text-muted-foreground text-center py-16">加载中...</p>
        ) : applications.length === 0 ? (
          <p className="text-muted-foreground text-center py-16">暂无申请</p>
        ) : (
          <div className="rounded-xl border border-border/60 overflow-hidden bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="font-medium">申请人</TableHead>
                  <TableHead className="font-medium">邮箱</TableHead>
                  <TableHead className="font-medium">机构</TableHead>
                  <TableHead className="w-24 font-medium">状态</TableHead>
                  <TableHead className="w-32 font-medium">审批人</TableHead>
                  <TableHead className="w-36 font-medium">申请时间</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => {
                  const s = STATUS_STYLES[app.status];
                  return (
                    <TableRow
                      key={app.id}
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() => openDialog(app)}
                    >
                      <TableCell className="font-medium">{app.user.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{app.user.email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{app.institution || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${s.className} text-xs`}>{s.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{app.reviewer?.name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(app.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                          onClick={(e) => { e.stopPropagation(); openDialog(app); }}>查看</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button variant="outline" size="sm" onClick={() => handlePage(page - 1)} disabled={page <= 1}>上一页</Button>
            <span className="text-sm text-muted-foreground">第 {page} / {totalPages} 页（共 {total} 条）</span>
            <Button variant="outline" size="sm" onClick={() => handlePage(page + 1)} disabled={page >= totalPages}>下一页</Button>
          </div>
        )}
      </main>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>申请详情</DialogTitle>
          </DialogHeader>
          {selected && (() => {
            const s = STATUS_STYLES[selected.status];
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={s.className}>{s.label}</Badge>
                </div>
                <div className="grid gap-2.5 text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-muted-foreground">申请人</span>
                    <span className="col-span-2 font-medium">{selected.user.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-muted-foreground">邮箱</span>
                    <span className="col-span-2">{selected.user.email}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-muted-foreground">机构</span>
                    <span className="col-span-2">{selected.institution}</span>
                  </div>
                  {selected.homepage && (
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-muted-foreground">主页</span>
                      <a href={selected.homepage} target="_blank" rel="noreferrer" className="col-span-2 text-primary underline break-all">
                        {selected.homepage}
                      </a>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-muted-foreground">申请用途</span>
                    <span className="col-span-2 whitespace-pre-wrap">{selected.purpose}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-muted-foreground">申请时间</span>
                    <span className="col-span-2">{new Date(selected.createdAt).toLocaleString("zh-CN")}</span>
                  </div>
                  {selected.reviewedAt && (
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-muted-foreground">审批时间</span>
                      <span className="col-span-2">{new Date(selected.reviewedAt).toLocaleString("zh-CN")}</span>
                    </div>
                  )}
                  {selected.reviewer && (
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-muted-foreground">审批人</span>
                      <span className="col-span-2">{selected.reviewer.name}</span>
                    </div>
                  )}
                  {selected.rejectReason && (
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-muted-foreground">拒绝原因</span>
                      <span className="col-span-2 text-red-600">{selected.rejectReason}</span>
                    </div>
                  )}
                </div>

                {selected.status === "PENDING" && (
                  <div className="border-t pt-4 space-y-3">
                    {showRejectForm ? (
                      <>
                        <div className="space-y-1.5">
                          <Label>拒绝原因（选填）</Label>
                          <Textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="可填写原因告知申请人"
                            rows={3}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button variant="destructive" onClick={() => act("reject")} disabled={processing}>
                            {processing ? "处理中..." : "确认拒绝"}
                          </Button>
                          <Button variant="outline" onClick={() => setShowRejectForm(false)} disabled={processing}>取消</Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex gap-2">
                        <Button onClick={() => act("approve")} disabled={processing}>
                          {processing ? "处理中..." : "通过申请"}
                        </Button>
                        <Button variant="outline" className="text-destructive" onClick={() => setShowRejectForm(true)} disabled={processing}>
                          拒绝
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
