"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface LLMConfig {
  id: string;
  name: string;
  apiBaseUrl: string | null;
  apiKey: string | null;
  models: string;
}

interface ModelResult {
  ok?: boolean;
  preview?: string;
  message?: string;
  loading: boolean;
}

const emptyForm = { name: "", apiBaseUrl: "", apiKey: "", models: "" };
const PAGE_SIZE = 10;

export default function AccountConfigPage() {
  const { user, loading, authFetch } = useAuth();
  const router = useRouter();
  const language = user?.language === "en" ? "en" : "zh";
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);

  // Detail/test dialog
  const [detailConfig, setDetailConfig] = useState<LLMConfig | null>(null);
  // testResults[configId][model] = ModelResult
  const [testResults, setTestResults] = useState<Record<string, Record<string, ModelResult>>>({});
  const [testingAll, setTestingAll] = useState<string | null>(null); // configId being bulk-tested

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  const load = () => {
    authFetch("/api/student/llm-config")
      .then((r) => r.json())
      .then((data) => setConfigs(data.configs || []));
  };

  useEffect(() => {
    if (user) load();
  }, [user]); // eslint-disable-line

  const totalPages = Math.ceil(configs.length / PAGE_SIZE);
  const pagedConfigs = configs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (c: LLMConfig) => {
    setEditId(c.id);
    setForm({
      name: c.name,
      apiBaseUrl: c.apiBaseUrl || "",
      apiKey: c.apiKey || "",
      models: (c.models || "").split(",").map((m) => m.trim()).filter(Boolean).join("\n"),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name) return toast.error("名称不能为空");
    if (!form.apiBaseUrl || !form.apiKey) return toast.error("API Base URL 和 Key 不能为空");
    setSaving(true);
    const normalizedModels = form.models.split(/[\n,]/).map((m) => m.trim()).filter(Boolean).join(",");
    try {
      const url = editId ? `/api/student/llm-config/${editId}` : "/api/student/llm-config";
      const res = await authFetch(url, {
        method: editId ? "PUT" : "POST",
        body: JSON.stringify({ ...form, models: normalizedModels }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setOpen(false);
      load();
      toast.success(editId ? "已更新" : "已添加");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm("确定删除该 LLM 配置？")) return;
    await authFetch(`/api/student/llm-config/${id}`, { method: "DELETE" });
    load();
    toast.success("已删除");
  };

  const testOneModel = async (configId: string, model: string) => {
    setTestResults((prev) => ({
      ...prev,
      [configId]: { ...prev[configId], [model]: { loading: true } },
    }));
    try {
      const res = await authFetch(`/api/student/llm-config/${configId}/validate`, {
        method: "POST",
        body: JSON.stringify({ model }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [configId]: { ...prev[configId], [model]: { ok: data.ok, preview: data.preview, message: data.message, loading: false } },
      }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [configId]: { ...prev[configId], [model]: { ok: false, message: "请求失败", loading: false } },
      }));
    }
  };

  const testAll = async (c: LLMConfig) => {
    const models = c.models.split(",").map((m) => m.trim()).filter(Boolean);
    if (models.length === 0) return toast.error("该配置没有填写模型");
    setTestingAll(c.id);
    for (const model of models) {
      await testOneModel(c.id, model);
    }
    setTestingAll(null);
  };

  // Summary helper for table row
  const getResultSummary = (configId: string, models: string) => {
    const modelList = models.split(",").map((m) => m.trim()).filter(Boolean);
    if (modelList.length === 0) return null;
    const results = testResults[configId] ?? {};
    const tested = modelList.filter((m) => results[m]?.ok !== undefined);
    if (tested.length === 0) return null;
    const passed = tested.filter((m) => results[m]?.ok === true).length;
    return { passed, failed: tested.length - passed, total: modelList.length };
  };

  if (loading) return <div><Navbar backHref="/account" backLabel="账户中心" /></div>;

  return (
    <div>
      <Navbar backHref="/account" backLabel="账户中心" breadcrumbs={[{ label: "LLM配置" }]} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">LLM 配置</h1>
            <p className="text-sm text-muted-foreground mt-1">添加 OpenAI 兼容 API 账号，参加活动或者发起活动时可选用。</p>
          </div>
          <Button size="sm" onClick={openNew}>+ 添加</Button>
        </div>

        {configs.length === 0 ? (
          <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
            <p className="mb-3">还没有 LLM 账号</p>
            <Button variant="outline" size="sm" onClick={openNew}>添加第一个</Button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border/60 overflow-hidden bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-medium">名称</TableHead>
                    <TableHead className="font-medium">API 地址</TableHead>
                    <TableHead className="w-16 text-center font-medium">模型数</TableHead>
                    <TableHead className="w-32 font-medium">测试状态</TableHead>
                    <TableHead className="w-36" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedConfigs.map((c) => {
                    const modelList = c.models.split(",").map((m) => m.trim()).filter(Boolean);
                    const summary = getResultSummary(c.id, c.models);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono truncate max-w-[180px]">
                          {c.apiBaseUrl || <span className="text-muted-foreground/40">未设置</span>}
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">{modelList.length}</TableCell>
                        <TableCell>
                          {summary ? (
                            summary.failed === 0 ? (
                              <span className="text-xs text-green-700 font-medium">✓ {summary.passed}/{summary.total} 通过</span>
                            ) : (
                              <span className="text-xs text-destructive font-medium">✗ {summary.failed} 失败</span>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">未测试</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 justify-end">
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                              onClick={() => setDetailConfig(c)}>测试</Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                              onClick={() => openEdit(c)}>编辑</Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive"
                              onClick={() => del(c.id)}>删除</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>上一页</Button>
                <span className="text-sm text-muted-foreground">第 {page} / {totalPages} 页</span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>下一页</Button>
              </div>
            )}
          </>
        )}

        {/* Test detail dialog */}
        <Dialog open={!!detailConfig} onOpenChange={(o) => { if (!o) setDetailConfig(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{language === "en" ? "Model Connectivity Test" : "模型连通性测试"} — {detailConfig?.name}</DialogTitle>
            </DialogHeader>
            {detailConfig && (() => {
              const modelList = detailConfig.models.split(",").map((m) => m.trim()).filter(Boolean);
              const cfgResults = testResults[detailConfig.id] ?? {};
              const isBulkTesting = testingAll === detailConfig.id;
              return (
                <div className="space-y-4 pt-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground font-mono truncate">{detailConfig.apiBaseUrl || "未设置 API 地址"}</p>
                    <Button
                      size="sm"
                      onClick={() => testAll(detailConfig)}
                      disabled={isBulkTesting || modelList.length === 0}
                    >
                      {isBulkTesting ? "测试中..." : "全部测试"}
                    </Button>
                  </div>

                  {modelList.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">该配置没有填写模型，请先编辑添加模型。</p>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead className="font-medium">模型</TableHead>
                            <TableHead className="font-medium">状态</TableHead>
                            <TableHead className="font-medium">响应预览</TableHead>
                            <TableHead className="w-16" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {modelList.map((model) => {
                            const r = cfgResults[model];
                            return (
                              <TableRow key={model}>
                                <TableCell className="font-mono text-sm">{model}</TableCell>
                                <TableCell>
                                  {!r && <span className="text-xs text-muted-foreground">未测试</span>}
                                  {r?.loading && <span className="text-xs text-muted-foreground animate-pulse">测试中...</span>}
                                  {r && !r.loading && r.ok === true && <span className="text-xs text-green-700 font-medium">✓ 通过</span>}
                                  {r && !r.loading && r.ok === false && <span className="text-xs text-destructive font-medium">✗ 失败</span>}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground font-mono max-w-[200px]">
                                  {r?.preview && <span className="truncate block">{r.preview}</span>}
                                  {r?.message && !r.ok && <span className="truncate block text-destructive">{r.message}</span>}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="sm" variant="ghost" className="h-7 px-2 text-xs"
                                    onClick={() => testOneModel(detailConfig.id, model)}
                                    disabled={r?.loading || isBulkTesting}
                                  >
                                    {r?.loading ? "..." : "测试"}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Edit/Add dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{language === "en" ? `${editId ? "Edit" : "Add"} LLM Account` : `${editId ? "编辑" : "添加"} LLM 账号`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label>名称 *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例：阿里云 / OpenAI" />
              </div>
              <div className="space-y-1.5">
                <Label>API Base URL *</Label>
                <Input value={form.apiBaseUrl} onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1" />
              </div>
              <div className="space-y-1.5">
                <Label>API Key *</Label>
                <Input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="sk-..." />
              </div>
              <div className="space-y-1.5">
                <Label>可用模型（每行一个）</Label>
                <Textarea value={form.models} onChange={(e) => setForm({ ...form, models: e.target.value })}
                  placeholder={"gpt-4o\ngpt-4o-mini"} rows={4} />
              </div>
              <Button className="w-full" onClick={save} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
