"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ConnectivityTestDialog } from "@/components/ConnectivityTestDialog";

interface LLMConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string; // masked
  models: string; // comma-separated
  createdAt: string;
}

export default function LLMConfigsPage() {
  const { user, loading, authFetch } = useAuth();
  const router = useRouter();
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [form, setForm] = useState({ name: "", baseUrl: "", apiKey: "", models: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testDialog, setTestDialog] = useState<{ open: boolean; status: "testing" | "success" | "fail"; message?: string; preview?: string }>({ open: false, status: "testing" });

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role !== "ADMIN") router.replace("/not-found");
    }
  }, [user, loading, router]);

  const load = () => {
    authFetch("/api/admin/llm-configs").then((r) => r.json()).then((d) => setConfigs(d.configs || []));
  };

  useEffect(() => { if (user) load(); }, [user]); // eslint-disable-line

  const openNew = () => {
    setEditId(null);
    setForm({ name: "", baseUrl: "https://api.openai.com/v1", apiKey: "", models: "" });
    setOpen(true);
  };

  const openEdit = (c: LLMConfig) => {
    setEditId(c.id);
    setForm({ name: c.name, baseUrl: c.baseUrl, apiKey: "", models: c.models });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name || (!editId && !form.apiKey)) {
      return toast.error("名称和 API Key 不能为空");
    }
    setSaving(true);
    try {
      const url = editId ? `/api/admin/llm-configs/${editId}` : "/api/admin/llm-configs";
      const res = await authFetch(url, {
        method: editId ? "PUT" : "POST",
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setOpen(false);
      load();
      toast.success(editId ? "已更新" : "已添加");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  const testConfig = async (c: LLMConfig) => {
    setTesting(c.id);
    setTestDialog({ open: true, status: "testing" });
    try {
      const [res] = await Promise.all([
        authFetch(`/api/admin/llm-configs/${c.id}/test`, { method: "POST" }),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
      const data = await (res as Response).json();
      if (data.ok) {
        setTestDialog({ open: true, status: "success", preview: `模型：${data.model}，回复: ${data.preview}` });
        setTimeout(() => setTestDialog((v) => ({ ...v, open: false })), 2000);
      } else {
        setTestDialog({ open: true, status: "fail", message: data.error || "连接失败" });
      }
    } catch {
      setTestDialog({ open: true, status: "fail", message: "测试请求失败" });
    } finally {
      setTesting(null);
    }
  };

  const del = async (id: string) => {
    if (!confirm("确定删除这个 LLM 配置吗？如果已有评分器正在使用它，将无法删除。")) return;
    const res = await authFetch(`/api/admin/llm-configs/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return toast.error(data.error || "删除失败");
    }
    load();
    toast.success("已删除");
  };

  if (loading) return <div><Navbar backHref="/dashboard" backLabel="活动广场" /></div>;

  return (
    <div>
      <Navbar backHref="/dashboard" backLabel="活动广场" breadcrumbs={[{ label: "LLM 配置" }]} />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">LLM 配置</h1>
            <p className="text-sm text-muted-foreground mt-1">管理可供评分器使用的 LLM 提供商</p>
          </div>
          <Button size="sm" onClick={openNew}>+ 添加</Button>
        </div>

        <div className="space-y-3">
          {configs.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                <p className="mb-3">还没有 LLM 配置</p>
                <Button variant="outline" size="sm" onClick={openNew}>添加第一个</Button>
              </CardContent>
            </Card>
          )}
          {configs.map((c) => {
            const modelList = c.models.split(",").map(m => m.trim()).filter(Boolean);
            return (
              <Card key={c.id}>
                <CardHeader className="py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{c.name}</CardTitle>
                      <CardDescription className="mt-0.5 space-y-0.5">
                        <div>{c.baseUrl} · Key: <code className="text-xs">{c.apiKey}</code></div>
                        {modelList.length > 0 && (
                          <div className="text-xs">模型：{modelList.join("、")}</div>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testConfig(c)}
                        disabled={testing === c.id}
                      >
                        {testing === c.id ? "测试中..." : "测试连接"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(c)}>编辑</Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => del(c.id)}>删除</Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "编辑" : "添加"} LLM 配置</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>显示名称 *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例：GPT-4o (OpenAI)" />
              </div>
              <div className="space-y-1.5">
                <Label>API Base URL</Label>
                <Input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1" />
              </div>
              <div className="space-y-1.5">
                <Label>API Key {editId ? "（留空不修改）" : "*"}</Label>
                <Input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="sk-..." />
              </div>
              <div className="space-y-1.5">
                <Label>可用模型（逗号分隔）</Label>
                <Textarea
                  value={form.models}
                  onChange={(e) => setForm({ ...form, models: e.target.value })}
                  placeholder="gpt-4o, gpt-4o-mini, gpt-4-turbo"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">在评分器设置时可从下拉选择，留空则手动输入</p>
              </div>
              <Button className="w-full" onClick={save} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
      <ConnectivityTestDialog
        open={testDialog.open}
        status={testDialog.status}
        message={testDialog.message}
        preview={testDialog.preview}
        onClose={() => setTestDialog({ open: false, status: "testing" })}
      />
    </div>
  );
}
