"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { MoreHorizontal, ArrowUp, ArrowDown, Search, X } from "lucide-react";

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
  return (
    <Suspense fallback={<div><Navbar /></div>}>
      <AdminUsersInner />
    </Suspense>
  );
}

function AdminUsersInner() {
  const { user, loading, authFetch, locale, t } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [institutions, setInstitutions] = useState<string[]>([]);
  const [fetching, setFetching] = useState(true);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkActing, setBulkActing] = useState(false);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");
  const [jumpPage, setJumpPage] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Number(searchParams.get("pageSize") ?? 20);
  const q = searchParams.get("q") ?? "";
  const role = searchParams.get("role") ?? "";
  const canPublish = searchParams.get("canPublish") ?? "";
  const institution = searchParams.get("institution") ?? "";
  const sort = searchParams.get("sort") ?? "createdAt";
  const order = searchParams.get("order") ?? "desc";

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role !== "ADMIN") router.replace("/not-found");
    }
  }, [user, loading, router]);

  const updateParams = useCallback((updates: Record<string, string>, resetPage = true) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    if (resetPage && !("page" in updates)) params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `/admin/users?${qs}` : "/admin/users");
  }, [searchParams, router]);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (pageSize !== 20) params.set("pageSize", String(pageSize));
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    if (canPublish) params.set("canPublish", canPublish);
    if (institution) params.set("institution", institution);
    if (sort && sort !== "createdAt") params.set("sort", sort);
    if (order && order !== "desc") params.set("order", order);

    setFetching(true);
    authFetch(`/api/admin/users?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.users || []);
        setTotal(data.total ?? 0);
        if (data.institutions) setInstitutions(data.institutions);
      })
      .finally(() => setFetching(false));
  }, [page, pageSize, q, role, canPublish, institution, sort, order, authFetch]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  useEffect(() => {
    setSelected(new Set());
  }, [page, pageSize, q, role, canPublish, institution]);

  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ q: value });
    }, 300);
  };

  const handleSort = (col: string) => {
    if (sort === col) {
      updateParams({ sort: col, order: order === "asc" ? "desc" : "asc" }, false);
    } else {
      updateParams({ sort: col, order: "asc" }, false);
    }
  };

  const clearFilters = () => {
    setSearchInput("");
    router.replace("/admin/users");
  };

  const hasFilters = q || role || canPublish || institution;

  const goToPage = (p: number) => {
    const clamped = Math.max(1, Math.min(totalPages, p));
    updateParams({ page: clamped > 1 ? String(clamped) : "" }, false);
  };

  const deletableOnPage = users.filter((u) => u.id !== user?.id);
  const allSelected = deletableOnPage.length > 0 && deletableOnPage.every((u) => selected.has(u.id));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(deletableOnPage.map((u) => u.id)));
  };

  const deleteUser = async (u: UserRow) => {
    if (!confirm(t("admin.users.confirmDelete" as any, { email: u.email }))) return;
    const res = await authFetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || t("common.failed" as any));
    toast.success(t("admin.users.deleted" as any));
    setSelected((prev) => { const next = new Set(prev); next.delete(u.id); return next; });
    load();
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(t("admin.users.confirmBulkDelete" as any, { count: ids.length }))) return;
    setBulkDeleting(true);
    try {
      const res = await authFetch("/api/admin/users", { method: "DELETE", body: JSON.stringify({ ids }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.failed" as any));
      toast.success(t("admin.users.deletedCount" as any, { count: data.deleted }));
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.failed" as any));
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
    if (!res.ok) return toast.error(data.error || t("common.failed" as any));
    toast.success(u.canPublish ? t("admin.users.permissionRevoked" as any) : t("admin.users.permissionGranted" as any));
    load();
  };

  const toggleRole = async (u: UserRow) => {
    const newRole = u.role === "ADMIN" ? "STUDENT" : "ADMIN";
    const roleLabel = newRole === "ADMIN" ? t("admin.users.admin" as any) : t("admin.users.student" as any);
    if (!confirm(t("admin.users.confirmRoleChange" as any, { email: u.email, role: roleLabel }))) return;
    const res = await authFetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || t("common.failed" as any));
    toast.success(t("admin.users.roleChanged" as any, { role: roleLabel }));
    load();
  };

  const bulkAction = async (action: "setRole" | "setCanPublish", value: string | boolean, labelKey: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkActing(true);
    try {
      const res = await authFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ ids, action, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.failed" as any));
      toast.success(`${t(labelKey as any)} — ${data.updated}`);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.failed" as any));
    } finally {
      setBulkActing(false);
    }
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    if (newPassword.length < 6) return toast.error(t("auth.passwordTooShort" as any));
    setSaving(true);
    try {
      const res = await authFetch(`/api/admin/users/${resetTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.failed" as any));
      toast.success(t("admin.users.passwordReset" as any));
      setResetTarget(null);
      setNewPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.failed" as any));
    } finally {
      setSaving(false);
    }
  };

  const SortHeader = ({ col, label }: { col: string; label: string }) => (
    <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSort(col)}>
      {label}
      {sort === col && (order === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  );

  if (loading) return <div><Navbar /></div>;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const pageNumbers = () => {
    const pages: (number | "...")[] = [];
    const delta = 2;
    const left = Math.max(2, page - delta);
    const right = Math.min(totalPages - 1, page + delta);
    pages.push(1);
    if (left > 2) pages.push("...");
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push("...");
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  };

  return (
    <div>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">{t("admin.users.title" as any)}</h1>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder={t("admin.users.searchPlaceholder" as any)}
              value={searchInput}
              onChange={(e) => handleSearchInput(e.target.value)}
            />
          </div>
          <Select value={role || "__all__"} onValueChange={(v) => updateParams({ role: v === "__all__" ? "" : (v ?? "") })}>
            <SelectTrigger className="w-[130px] h-9">
              <span className="text-sm">{role ? (role === "ADMIN" ? t("admin.users.admin" as any) : t("admin.users.student" as any)) : t("admin.users.allRoles" as any)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("admin.users.allRoles" as any)}</SelectItem>
              <SelectItem value="ADMIN">{t("admin.users.admin" as any)}</SelectItem>
              <SelectItem value="STUDENT">{t("admin.users.student" as any)}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={canPublish || "__all__"} onValueChange={(v) => updateParams({ canPublish: v === "__all__" ? "" : (v ?? "") })}>
            <SelectTrigger className="w-[140px] h-9">
              <span className="text-sm">{canPublish === "true" ? t("admin.users.authorized" as any) : canPublish === "false" ? t("admin.users.notAuthorized" as any) : t("admin.users.allPublish" as any)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("admin.users.allPublish" as any)}</SelectItem>
              <SelectItem value="true">{t("admin.users.authorized" as any)}</SelectItem>
              <SelectItem value="false">{t("admin.users.notAuthorized" as any)}</SelectItem>
            </SelectContent>
          </Select>
          {institutions.length > 0 && (
            <Select value={institution || "__all__"} onValueChange={(v) => updateParams({ institution: v === "__all__" ? "" : (v ?? "") })}>
              <SelectTrigger className="w-[160px] h-9">
                <span className="text-sm">{institution ? (INSTITUTION_LABELS[institution] ?? institution) : t("admin.users.allInstitutions" as any)}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("admin.users.allInstitutions" as any)}</SelectItem>
                {institutions.map((inst) => (
                  <SelectItem key={inst} value={inst!}>{INSTITUTION_LABELS[inst!] ?? inst}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={String(pageSize)} onValueChange={(v) => updateParams({ pageSize: v === "20" ? "" : (v ?? "20") })}>
            <SelectTrigger className="w-[100px] h-9">
              <span className="text-sm">{t("admin.users.perPage" as any, { count: pageSize })}</span>
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>{t("admin.users.perPage" as any, { count: n })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-9 text-xs gap-1" onClick={clearFilters}>
              <X className="h-3 w-3" />{t("admin.users.clearFilters" as any)}
            </Button>
          )}
        </div>

        {/* Bulk action toolbar */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-muted/50 rounded-lg border">
            <span className="text-sm font-medium text-muted-foreground mr-1">
              {t("admin.users.selectedCount" as any, { count: selected.size })}
            </span>
            <Button size="sm" variant="outline" className="h-7 text-xs border-indigo-300 text-indigo-600 hover:bg-indigo-50"
              onClick={() => bulkAction("setRole", "ADMIN", "admin.users.setAdmin")} disabled={bulkActing}>
              {t("admin.users.setAdmin" as any)}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => bulkAction("setRole", "STUDENT", "admin.users.setStudent")} disabled={bulkActing}>
              {t("admin.users.setStudent" as any)}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs border-green-300 text-green-600 hover:bg-green-50"
              onClick={() => bulkAction("setCanPublish", true, "admin.users.grantPublish")} disabled={bulkActing}>
              {t("admin.users.grantPublish" as any)}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => bulkAction("setCanPublish", false, "admin.users.revokePublish")} disabled={bulkActing}>
              {t("admin.users.revokePublish" as any)}
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="destructive" className="h-7 text-xs"
              onClick={bulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? t("admin.users.deleting" as any) : t("admin.users.deleteSelected" as any)}
            </Button>
          </div>
        )}

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4" />
                </TableHead>
                <TableHead><SortHeader col="name" label={t("admin.users.user" as any)} /></TableHead>
                <TableHead className="w-24"><SortHeader col="role" label={t("admin.users.role" as any)} /></TableHead>
                <TableHead className="w-24">{t("admin.users.publish" as any)}</TableHead>
                <TableHead className="w-36">{t("admin.users.activity" as any)}</TableHead>
                <TableHead className="w-28"><SortHeader col="createdAt" label={t("admin.users.registered" as any)} /></TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fetching && users.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("common.loading" as any)}</TableCell></TableRow>
              ) : users.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">—</TableCell></TableRow>
              ) : users.map((u) => {
                const isSelf = u.id === user?.id;
                return (
                  <TableRow key={u.id} className={selected.has(u.id) ? "bg-muted/40" : ""}>
                    <TableCell>
                      {!isSelf && (
                        <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)} className="h-4 w-4" />
                      )}
                    </TableCell>
                    {/* User column: name + email + institution */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="font-medium text-sm flex items-center gap-1.5">
                          {u.name}
                          {isSelf && <span className="text-xs text-muted-foreground">{t("admin.users.you" as any)}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">{u.email}</div>
                        {(u.institution || u.institutionId) && (
                          <div className="text-xs text-muted-foreground">
                            {u.institution && (INSTITUTION_LABELS[u.institution] ?? u.institution)}
                            {u.institution && u.institutionId && " · "}
                            {u.institutionId && <span className="font-mono">{u.institutionId}</span>}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    {/* Role */}
                    <TableCell>
                      <Badge variant={u.role === "ADMIN" ? "destructive" : "secondary"} className="text-xs">
                        {u.role === "ADMIN" ? t("admin.users.admin" as any) : t("admin.users.student" as any)}
                      </Badge>
                    </TableCell>
                    {/* Publish */}
                    <TableCell>
                      {u.role === "ADMIN" ? (
                        <span className="text-xs text-muted-foreground">{t("admin.users.included" as any)}</span>
                      ) : u.canPublish ? (
                        <Badge className="bg-green-600 text-xs">{t("admin.users.authorized" as any)}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {/* Activity */}
                    <TableCell className="text-xs text-muted-foreground">
                      {t("admin.users.enrolledCount" as any, { count: u._count.enrollments })}
                      {" · "}
                      {t("admin.users.submittedCount" as any, { count: u._count.submissions })}
                    </TableCell>
                    {/* Registered */}
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString(locale)}
                    </TableCell>
                    {/* Actions dropdown */}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted">
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setResetTarget(u); setNewPassword(""); }}>
                            {t("admin.users.resetPassword" as any)}
                          </DropdownMenuItem>
                          {!isSelf && (
                            <>
                              <DropdownMenuItem onClick={() => toggleRole(u)}>
                                {u.role === "ADMIN" ? t("admin.users.setStudent" as any) : t("admin.users.setAdmin" as any)}
                              </DropdownMenuItem>
                              {u.role !== "ADMIN" && (
                                <DropdownMenuItem onClick={() => toggleCanPublish(u)}>
                                  {u.canPublish ? t("admin.users.revokePublish" as any) : t("admin.users.grantPublish" as any)}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => deleteUser(u)}>
                                {t("common.delete" as any)}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
            <span className="text-sm text-muted-foreground">
              {t("admin.users.showingRange" as any, { from, to, total })}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => goToPage(1)} disabled={page <= 1}>«</Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => goToPage(page - 1)} disabled={page <= 1}>‹</Button>
              {pageNumbers().map((p, i) =>
                p === "..." ? (
                  <span key={`e${i}`} className="px-1 text-muted-foreground text-sm">…</span>
                ) : (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    className="h-8 w-8 p-0 text-xs"
                    onClick={() => goToPage(p as number)}
                  >
                    {p}
                  </Button>
                )
              )}
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>›</Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => goToPage(totalPages)} disabled={page >= totalPages}>»</Button>
              <div className="flex items-center gap-1 ml-2">
                <Input
                  className="w-14 h-8 text-xs text-center"
                  value={jumpPage}
                  onChange={(e) => setJumpPage(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter" && jumpPage) { goToPage(Number(jumpPage)); setJumpPage(""); } }}
                  placeholder="#"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => { if (jumpPage) { goToPage(Number(jumpPage)); setJumpPage(""); } }}
                >
                  {t("admin.users.goToPage" as any)}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Reset password dialog */}
        <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) setResetTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("admin.users.resetPassword" as any)} — {resetTarget?.email}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label>{t("admin.users.newPasswordLabel" as any)}</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("admin.users.newPasswordPlaceholder" as any)}
                  onKeyDown={(e) => e.key === "Enter" && resetPassword()}
                />
              </div>
              <Button className="w-full" onClick={resetPassword} disabled={saving}>
                {saving ? t("common.saving" as any) : t("admin.users.confirmReset" as any)}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
