"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  canPublish: boolean;
  createdAt: string;
  institution: string | null;
  institutionId: string | null;
  _count: { enrollments: number; submissions: number };
}

const INSTITUTION_LABELS: Record<string, string> = {
  jaccount: "上海交通大学",
};

export default function AdminUsersPage() {
  const { user, loading, authFetch } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkActing, setBulkActing] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role !== "ADMIN") router.replace("/not-found");
    }
  }, [user, loading, router]);

  const load = () => {
    authFetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => setUsers(data.users || []))
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    if (user) load();
  }, [user]); // eslint-disable-line

  const deletableUsers = users.filter((u) => u.id !== user?.id);
  const totalPages = Math.ceil(users.length / PAGE_SIZE);
  const pagedUsers = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = deletableUsers.length > 0 && deletableUsers.every((u) => selected.has(u.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(deletableUsers.map((u) => u.id)));
    }
  };

  const deleteUser = async (u: UserRow) => {
    if (!confirm(`确定要删除用户 ${u.email} 吗？此操作不可撤销。`)) return;
    const res = await authFetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || "删除失败");
    toast.success("已删除");
    setSelected((prev) => { const next = new Set(prev); next.delete(u.id); return next; });
    load();
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`确定要删除选中的 ${ids.length} 名用户吗？此操作不可撤销。`)) return;
    setBulkDeleting(true);
    try {
      const res = await authFetch("/api/admin/users", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "失败");
      toast.success(`已删除 ${data.deleted} 名用户`);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleCanPublish = async (u: UserRow) => {
    const res = await authFetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ canPublish: !u.canPublish }),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || "操作失败");
    toast.success(u.canPublish ? "已撤销发布权限" : "已授予发布权限");
    load();
  };

  const toggleRole = async (u: UserRow) => {
    const newRole = u.role === "ADMIN" ? "STUDENT" : "ADMIN";
    if (!confirm(`确定要将 ${u.email} 的角色改为「${newRole === "ADMIN" ? "管理员" : "用户"}」吗？`)) return;
    const res = await authFetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || "操作失败");
    toast.success(`已将角色改为${newRole === "ADMIN" ? "管理员" : "用户"}`);
    load();
  };

  const bulkAction = async (action: "setRole" | "setCanPublish", value: string | boolean, label: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkActing(true);
    try {
      const res = await authFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ ids, action, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "失败");
      toast.success(`已${label} ${data.updated} 名用户`);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBulkActing(false);
    }
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    if (newPassword.length < 6) return toast.error("密码至少6位");
    setSaving(true);
    try {
      const res = await authFetch(`/api/admin/users/${resetTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "失败");
      toast.success("密码已重置");
      setResetTarget(null);
      setNewPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading || fetching) return <div><Navbar backHref="/dashboard" backLabel="管理控制台" /></div>;

  return (
    <div>
      <Navbar backHref="/dashboard" backLabel="管理控制台" breadcrumbs={[{ label: "用户管理" }]} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">用户管理</h1>
        </div>

        {/* Bulk action toolbar */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-muted/50 rounded-lg border">
            <span className="text-sm font-medium text-muted-foreground mr-1">已选 {selected.size} 人：</span>
            <Button size="sm" variant="outline" className="h-7 text-xs border-indigo-300 text-indigo-600 hover:bg-indigo-50"
              onClick={() => bulkAction("setRole", "ADMIN", "设为管理员")} disabled={bulkActing}>
              设为管理员
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => bulkAction("setRole", "STUDENT", "设为普通用户")} disabled={bulkActing}>
              设为普通用户
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs border-green-300 text-green-600 hover:bg-green-50"
              onClick={() => bulkAction("setCanPublish", true, "授予发布权限")} disabled={bulkActing}>
              授予发布权限
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => bulkAction("setCanPublish", false, "取消发布权限")} disabled={bulkActing}>
              取消发布权限
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="destructive" className="h-7 text-xs"
              onClick={bulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? "删除中..." : `删除选中`}
            </Button>
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4"
                />
              </TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>姓名</TableHead>
              <TableHead>学工号</TableHead>
              <TableHead>机构</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>发布权限</TableHead>
              <TableHead className="text-center">报名</TableHead>
              <TableHead className="text-center">提交</TableHead>
              <TableHead>注册时间</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedUsers.map((u) => {
              const isSelf = u.id === user?.id;
              return (
                <TableRow key={u.id} className={selected.has(u.id) ? "bg-muted/40" : ""}>
                  <TableCell>
                    {!isSelf && (
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={() => toggleSelect(u.id)}
                        className="h-4 w-4"
                      />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{u.email}</TableCell>
                  <TableCell>{u.name}{isSelf && <span className="ml-1 text-xs text-muted-foreground">(你)</span>}</TableCell>
                  <TableCell className="font-mono text-sm">{u.institutionId ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm">
                    {u.institution
                      ? (INSTITUTION_LABELS[u.institution] ?? u.institution)
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {isSelf ? (
                      <Badge variant={u.role === "ADMIN" ? "destructive" : "secondary"} className="text-xs">
                        {u.role === "ADMIN" ? "管理员" : "用户"}
                      </Badge>
                    ) : u.role === "ADMIN" ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs gap-1"
                        onClick={() => toggleRole(u)}
                        title="点击降为普通用户"
                      >
                        管理员 ×
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 border-indigo-300 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
                        onClick={() => toggleRole(u)}
                        title="点击设为管理员"
                      >
                        用户 ↑
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.role === "ADMIN" ? (
                      <span className="text-xs text-muted-foreground">含</span>
                    ) : (
                      <Button
                        size="sm"
                        variant={u.canPublish ? "default" : "outline"}
                        className={`h-7 text-xs ${u.canPublish ? "bg-green-600 hover:bg-green-700" : ""}`}
                        onClick={() => toggleCanPublish(u)}
                      >
                        {u.canPublish ? "已授权 ✓" : "授权"}
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm">{u._count.enrollments}</TableCell>
                  <TableCell className="text-center text-sm">{u._count.submissions}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm" variant="outline"
                        className="h-7 text-xs"
                        onClick={() => { setResetTarget(u); setNewPassword(""); }}
                      >
                        重置密码
                      </Button>
                      {!isSelf && (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-xs text-destructive"
                          onClick={() => deleteUser(u)}
                        >
                          删除
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>上一页</Button>
            <span className="text-sm text-muted-foreground">第 {page} / {totalPages} 页（共 {users.length} 人）</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>下一页</Button>
          </div>
        )}

        <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) setResetTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>重置密码 — {resetTarget?.email}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label>新密码（至少6位）</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="输入新密码"
                  onKeyDown={(e) => e.key === "Enter" && resetPassword()}
                />
              </div>
              <Button className="w-full" onClick={resetPassword} disabled={saving}>
                {saving ? "保存中..." : "确认重置"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
