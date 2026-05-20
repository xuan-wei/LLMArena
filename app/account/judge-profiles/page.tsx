"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ConnectivityTestDialog } from "@/components/ConnectivityTestDialog";

const OBJECTIVE_TEMPLATE = `你是一个严格的评判者。请根据题目和参考答案，判断学生答案是否正确。

题目：{{question}}
参考答案：{{expected}}
学生答案：{{output}}

如果学生答案正确（意思相同即可，不要求字面完全一致），返回 1；否则返回 0。
只返回一个 JSON 对象，格式为：{"score": 0或1, "reason": "简要说明"}`;

const SUBJECTIVE_TEMPLATE = `你是一个公正的评分者。请根据题目和参考答案（如有），对学生回答的质量进行评分。

题目：{{question}}
参考答案：{{expected}}（如为"无"则为开放题，请根据质量评分）
学生答案：{{output}}

请给出 0 到 1 之间的分数，反映回答的准确性、完整性和表达质量。
只返回一个 JSON 对象，格式为：{"score": 0到1的小数, "reason": "评分理由"}`;

interface LLMOption { id: string; name: string; models: string }
interface JudgeProfile {
  id: string;
  name: string;
  model: string;
  type: string;
  systemPrompt: string;
  enableThinking: boolean;
  thinkingBudget: number | null;
  temperature: number | null;
  maxTokens: number | null;
  llmConfigId: string | null;
  llmConfig: { id: string; name: string } | null;
  studentLLMConfigId: string | null;
  studentLLMConfig: { id: string; name: string } | null;
  lastTestStatus: string | null;
  lastTestedAt: string | null;
  lastTestMessage: string | null;
}

const emptyForm = { name: "", llmConfigId: "", studentLLMConfigId: "", model: "", type: "SUBJECTIVE", systemPrompt: SUBJECTIVE_TEMPLATE, enableThinking: true, thinkingBudget: "", temperature: "", maxTokens: "" };
const PAGE_SIZE = 10;

type StartOption = "blank" | "subjective" | "objective";

export default function JudgeProfilesPage() {
  const { user, loading, authFetch } = useAuth();
  const router = useRouter();
  const [profiles, setProfiles] = useState<JudgeProfile[]>([]);
  const [llmOptions, setLLMOptions] = useState<LLMOption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testDialog, setTestDialog] = useState<{ open: boolean; status: "testing" | "success" | "fail"; message?: string; preview?: string }>({ open: false, status: "testing" });
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role !== "ADMIN" && !user.canPublish) router.replace("/not-found");
    }
  }, [user, loading, router]);

  const load = () => {
    const profilesP = authFetch("/api/admin/judge-profiles").then((r) => r.json());
    const llmP = authFetch("/api/student/llm-config").then((r) => r.json()).then((d) =>
      (d.configs || []).map((c: { id: string; name: string; models: string }) => ({ id: c.id, name: c.name, models: c.models }))
    );
    Promise.all([profilesP, llmP]).then(([pd, opts]) => {
      setProfiles(pd.profiles || []);
      setLLMOptions(opts);
    });
  };

  useEffect(() => { if (user) load(); }, [user]); // eslint-disable-line

  const llmIdField = "studentLLMConfigId";
  const selectedLLMId = form.studentLLMConfigId;
  const selectedLLM = llmOptions.find(c => c.id === selectedLLMId);
  const availableModels = selectedLLM?.models.split(",").map(m => m.trim()).filter(Boolean) ?? [];

  const totalPages = Math.ceil(profiles.length / PAGE_SIZE);
  const pagedProfiles = profiles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openPicker = () => setPickerOpen(true);

  const openNew = (startFrom: StartOption = "blank") => {
    setPickerOpen(false);
    setEditId(null);
    if (startFrom === "subjective") {
      setForm({ ...emptyForm, name: "主观题评分器", type: "SUBJECTIVE", systemPrompt: SUBJECTIVE_TEMPLATE });
    } else if (startFrom === "objective") {
      setForm({ ...emptyForm, name: "客观题评分器", type: "OBJECTIVE", systemPrompt: OBJECTIVE_TEMPLATE });
    } else {
      setForm(emptyForm);
    }
    setOpen(true);
  };

  const openEdit = (p: JudgeProfile) => {
    setEditId(p.id);
    setForm({
      name: p.name,
      llmConfigId: p.llmConfigId || "",
      studentLLMConfigId: p.studentLLMConfigId || "",
      model: p.model || "",
      type: p.type,
      systemPrompt: p.systemPrompt,
      enableThinking: p.enableThinking,
      thinkingBudget: p.thinkingBudget != null ? String(p.thinkingBudget) : "",
      temperature: p.temperature != null ? String(p.temperature) : "",
      maxTokens: p.maxTokens != null ? String(p.maxTokens) : "",
    });
    setOpen(true);
  };

  const handleTypeChange = (newType: string | null) => {
    if (!newType) return;
    const defaultPrompt = newType === "OBJECTIVE" ? OBJECTIVE_TEMPLATE : SUBJECTIVE_TEMPLATE;
    const isDefault = form.systemPrompt === OBJECTIVE_TEMPLATE || form.systemPrompt === SUBJECTIVE_TEMPLATE;
    setForm({ ...form, type: newType, systemPrompt: isDefault ? defaultPrompt : form.systemPrompt });
  };

  const save = async () => {
    if (!form.name) return toast.error("请填写名称");
    setSaving(true);
    try {
      const url = editId ? `/api/admin/judge-profiles/${editId}` : "/api/admin/judge-profiles";
      const payload = {
        name: form.name,
        model: form.model,
        type: form.type,
        systemPrompt: form.systemPrompt,
        enableThinking: form.enableThinking,
        thinkingBudget: form.thinkingBudget || null,
        temperature: form.temperature || null,
        maxTokens: form.maxTokens || null,
        llmConfigId: null,
        studentLLMConfigId: form.studentLLMConfigId || null,
      };
      const res = await authFetch(url, {
        method: editId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setOpen(false);
      load();
      toast.success(editId ? "已更新" : "已创建");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    } finally {
      setSaving(false);
    }
  };

  const test = async (profileId: string) => {
    setTesting(profileId);
    setTestDialog({ open: true, status: "testing" });
    try {
      const [res] = await Promise.all([
        authFetch(`/api/admin/judge-profiles/${profileId}/test`, { method: "POST" }),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
      const data = await (res as Response).json();
      load();
      if (data.ok) {
        setTestDialog({ open: true, status: "success", preview: data.response?.slice(0, 200) });
        setTimeout(() => setTestDialog((v) => ({ ...v, open: false })), 2000);
      } else {
        setTestDialog({ open: true, status: "fail", message: data.error || "测试失败" });
      }
    } catch {
      setTestDialog({ open: true, status: "fail", message: "测试请求失败" });
    } finally {
      setTesting(null);
    }
  };

  const del = async (id: string) => {
    if (!confirm("确定删除该评分器？")) return;
    await authFetch(`/api/admin/judge-profiles/${id}`, { method: "DELETE" });
    load();
    toast.success("已删除");
  };

  const profileLLMName = (p: JudgeProfile) =>
    p.llmConfig?.name ?? p.studentLLMConfig?.name ?? "—";

  if (loading) return <div><Navbar /></div>;

  return (
    <div>
      <Navbar backHref="/account" backLabel="账户中心" breadcrumbs={[{ label: "评分器设置" }]} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">评分器设置</h1>
            <p className="text-sm text-muted-foreground mt-1">配置用于评分的 LLM 评分器</p>
          </div>
          <Button size="sm" onClick={openPicker}>+ 新建</Button>
        </div>

        {profiles.length === 0 ? (
          <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
            <p className="mb-3">还没有评分器配置</p>
            <Button variant="outline" size="sm" onClick={openPicker}>创建第一个</Button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border/60 overflow-hidden bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-medium">名称</TableHead>
                    <TableHead className="w-32 font-medium">类型</TableHead>
                    <TableHead className="font-medium">LLM 账号</TableHead>
                    <TableHead className="font-medium">模型</TableHead>
                    <TableHead className="w-24 font-medium">测试状态</TableHead>
                    <TableHead className="font-medium">响应预览</TableHead>
                    <TableHead className="w-36" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedProfiles.map((p) => {
                    const testOk = p.lastTestStatus === "ok";
                    const testFailed = p.lastTestStatus === "failed";
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {p.type === "OBJECTIVE" ? "客观题 0/1" : "主观题 0~1"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{profileLLMName(p)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {p.model || <span className="text-muted-foreground/40">—</span>}
                        </TableCell>
                        <TableCell>
                          {!p.lastTestStatus && <span className="text-xs text-muted-foreground">未测试</span>}
                          {testOk && <span className="text-xs text-green-700 font-medium">✓ 通过</span>}
                          {testFailed && <span className="text-xs text-destructive font-medium">✗ 失败</span>}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          {p.lastTestMessage && (
                            <span
                              className={`text-xs font-mono truncate block cursor-default ${testFailed ? "text-destructive" : "text-muted-foreground"}`}
                              title={p.lastTestMessage}
                            >
                              {p.lastTestMessage}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              variant={testOk ? "outline" : testFailed ? "destructive" : "default"}
                              size="sm" className="h-7 px-2 text-xs"
                              onClick={() => test(p.id)} disabled={testing === p.id}
                            >
                              {testing === p.id ? "测试中..." : "测试"}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                              onClick={() => openEdit(p)}>编辑</Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive"
                              onClick={() => del(p.id)}>删除</Button>
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

        {/* Template picker dialog */}
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>新建评分器 — 选择起点</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-3 pt-2">
              {([
                { key: "blank", title: "空白新建", desc: "从零开始，自定义所有配置", icon: "✦" },
                { key: "subjective", title: "主观题模板", desc: "0~1 连续分数，适合开放式问答", icon: "📝" },
                { key: "objective", title: "客观题模板", desc: "0 或 1 判断，适合有标准答案的题目", icon: "✅" },
              ] as { key: StartOption; title: string; desc: string; icon: string }[]).map(({ key, title, desc, icon }) => (
                <button
                  key={key}
                  onClick={() => openNew(key)}
                  className="flex flex-col items-start gap-2 rounded-xl border border-border/60 p-4 text-left hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  <span className="text-2xl">{icon}</span>
                  <span className="font-medium text-sm">{title}</span>
                  <span className="text-xs text-muted-foreground leading-relaxed">{desc}</span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "编辑" : "新建"}评分器</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>名称 *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例：客观题评分器" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>LLM 账号 *</Label>
                  {llmOptions.length === 0 ? (
                    <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground flex items-center justify-between gap-2">
                      <span>暂无 LLM 账号</span>
                      <button
                        type="button"
                        className="text-primary text-xs hover:underline shrink-0"
                        onClick={() => { setOpen(false); router.push("/account/llm-config"); }}
                      >
                        前往配置 →
                      </button>
                    </div>
                  ) : (
                    <Select
                      value={selectedLLMId}
                      onValueChange={(v) => v && setForm({ ...form, [llmIdField]: v, model: "" })}
                    >
                      <SelectTrigger>
                        <span className={`flex-1 text-left text-sm ${!selectedLLMId ? "text-muted-foreground" : ""}`}>
                          {llmOptions.find(c => c.id === selectedLLMId)?.name || "选择 LLM 账号"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {llmOptions.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>模型 *</Label>
                  {availableModels.length > 0 ? (
                    <Select value={form.model} onValueChange={(v) => v && setForm({ ...form, model: v })}>
                      <SelectTrigger>
                        <span className={`flex-1 text-left text-sm ${!form.model ? "text-muted-foreground" : ""}`}>
                          {form.model || "选择模型"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {availableModels.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
                      placeholder="gpt-4o" />
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.enableThinking}
                      onChange={(e) => setForm({ ...form, enableThinking: e.target.checked })}
                      className="h-4 w-4 rounded border"
                    />
                    <span className="text-sm font-medium">开启深度思考（Thinking）</span>
                  </label>
                  <p className="text-xs text-muted-foreground pl-6">仅 Qwen3 等支持 CoT 的模型有效；不支持的模型开启无效；部分本地部署的也无效</p>
                </div>
                {form.enableThinking && (
                  <div className="space-y-1.5 pl-6">
                    <Label>Thinking Budget（留空默认 1024）</Label>
                    <Input
                      value={form.thinkingBudget}
                      onChange={(e) => setForm({ ...form, thinkingBudget: e.target.value })}
                      placeholder="2048"
                      type="number"
                      min="0"
                      step="256"
                      className="w-36"
                    />
                    <p className="text-xs text-muted-foreground">限制评分器 LLM CoT 最多使用的 token 数</p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Temperature（留空使用默认值）</Label>
                  <Input
                    value={form.temperature}
                    onChange={(e) => setForm({ ...form, temperature: e.target.value })}
                    placeholder="0.7"
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    className="w-36"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Tokens（留空默认 2048）</Label>
                  <Input
                    value={form.maxTokens}
                    onChange={(e) => setForm({ ...form, maxTokens: e.target.value })}
                    placeholder="2048"
                    type="number"
                    min="256"
                    step="256"
                    className="w-36"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>题目类型</Label>
                <Select value={form.type} onValueChange={handleTypeChange}>
                  <SelectTrigger>
                    <span className="flex-1 text-left text-sm">
                      {form.type === "OBJECTIVE" ? "客观题（返回 0 或 1）" : "主观题（返回 0~1 分数）"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SUBJECTIVE">主观题（返回 0~1 分数）</SelectItem>
                    <SelectItem value="OBJECTIVE">客观题（返回 0 或 1）</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>评分提示词</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" className="text-xs h-7"
                      onClick={() => setForm({ ...form, systemPrompt: OBJECTIVE_TEMPLATE, type: "OBJECTIVE" })}>
                      用客观题模板
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="text-xs h-7"
                      onClick={() => setForm({ ...form, systemPrompt: SUBJECTIVE_TEMPLATE, type: "SUBJECTIVE" })}>
                      用主观题模板
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={form.systemPrompt}
                  onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                  rows={10}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  占位符：<code>{"{{question}}"}</code> 题目、<code>{"{{expected}}"}</code> 参考答案、<code>{"{{output}}"}</code> 学生答案
                </p>
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
        title="评分器连通性测试"
        onClose={() => setTestDialog({ open: false, status: "testing" })}
      />
    </div>
  );
}
