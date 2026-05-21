"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  reviewer: { name: string } | null;
  user: { id: string; email: string; name: string; institution: string | null };
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  PENDING:  { label: "待审核", className: "bg-amber-50 text-amber-700 border-amber-200" },
  APPROVED: { label: "已通过", className: "bg-green-50 text-green-700 border-green-200" },
  REJECTED: { label: "已拒绝", className: "bg-red-50 text-red-700 border-red-200" },
};

export default function ApplicationDetailPage() {
  const { user, loading, authFetch, locale } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [app, setApp] = useState<Application | null>(null);
  const [fetching, setFetching] = useState(true);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role !== "ADMIN") router.replace("/not-found");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !id) return;
    authFetch(`/api/admin/publisher-applications/${id}`)
      .then((r) => r.json())
      .then((data) => setApp(data.application))
      .finally(() => setFetching(false));
  }, [user, id]); // eslint-disable-line

  const act = async (action: "approve" | "reject") => {
    setProcessing(true);
    try {
      const res = await authFetch(`/api/admin/publisher-applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, rejectReason: action === "reject" ? rejectReason : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作失败");
      toast.success(action === "approve" ? "已通过，发布权限已授予" : "已拒绝");
      router.push("/admin/publisher-applications");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setProcessing(false);
    }
  };

  if (loading || fetching) return <div><Navbar /></div>;
  if (!app) return <div><Navbar /><main className="max-w-2xl mx-auto px-4 py-8"><p className="text-muted-foreground">申请不存在</p></main></div>;

  const s = STATUS_STYLES[app.status];

  return (
    <div>
      <Navbar
        backHref="/admin/publisher-applications"
        backLabel="发布权限申请"
        breadcrumbs={[{ label: app.user.name }]}
      />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">申请详情</h1>
          <Badge variant="outline" className={s.className}>{s.label}</Badge>
        </div>

        <div className="bg-white rounded-xl border border-border/60 px-6 py-5 space-y-4">
          <div className="grid gap-3 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">申请人</span>
              <span className="col-span-2 font-medium">{app.user.name}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">邮箱</span>
              <span className="col-span-2">{app.user.email}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">机构</span>
              <span className="col-span-2">{app.institution}</span>
            </div>
            {app.homepage && (
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">主页</span>
                <a href={app.homepage} target="_blank" rel="noreferrer" className="col-span-2 text-primary underline break-all">
                  {app.homepage}
                </a>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">申请用途</span>
              <span className="col-span-2 whitespace-pre-wrap">{app.purpose}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">申请时间</span>
              <span className="col-span-2">{new Date(app.createdAt).toLocaleString(locale)}</span>
            </div>
            {app.reviewedAt && (
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">审批时间</span>
                <span className="col-span-2">{new Date(app.reviewedAt).toLocaleString(locale)}</span>
              </div>
            )}
            {app.reviewer && (
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">审批人</span>
                <span className="col-span-2">{app.reviewer.name}</span>
              </div>
            )}
            {app.rejectReason && (
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">拒绝原因</span>
                <span className="col-span-2 text-red-600">{app.rejectReason}</span>
              </div>
            )}
          </div>
        </div>

        {app.status === "PENDING" && (
          <div className="space-y-3">
            {showRejectForm ? (
              <div className="bg-white rounded-xl border border-border/60 px-6 py-5 space-y-3">
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
              </div>
            ) : (
              <div className="flex gap-3">
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
      </main>
    </div>
  );
}
