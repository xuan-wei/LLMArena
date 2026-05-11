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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

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

// Admin uses LLMConfig; non-admin uses StudentLLMConfig
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

export default function JudgeProfilesPage() {
  const { user, loading, authFetch } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "ADMIN";
  const [profiles, setProfiles] = useState<JudgeProfile[]>([]);
  const [llmOptions, setLLMOptions] = useState<LLMOption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role !== "ADMIN" && !user.canPublish) router.replace("/not-found");
    }
  }, [user, loading, router]);

  const load = () => {
    const profilesP = authFetch("/api/admin/judge-profiles").then((r) => r.json());
    // All users (including admin) use their personal StudentLLMConfig for judge profiles
    const llmP = authFetch("/api/student/llm-config").then((r) => r.json()).then((d) =>
      (d.configs || []).map((c: { id: string; name: string; models: string }) => ({ id: c.id, name: c.name, models: c.models }))
    );

    Promise.all([profilesP, llmP]).then(([pd, opts]) => {
      setProfiles(pd.profiles || []);
      setLLMOptions(opts);
    });
  };

  useEffect(() => { if (user) load(); }, [user]); // eslint-disable-line

  // All users use studentLLMConfigId
  const llmIdField = "studentLLMConfigId";
  const selectedLLMId = form.studentLLMConfigId;

  const selectedLLM = llmOptions.find(c => c.id === selectedLLMId);
  const availableModels = selectedLLM?.models.split(",").map(m => m.trim()).filter(Boolean) ?? [];

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
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
    try {
      await authFetch(`/api/admin/judge-profiles/${profileId}/test`, { method: "POST" });
      load();
    } finally {
      setTesting(null);
    }
  };

  const del = async (id: string) => {
    await authFetch(`/api/admin/judge-profiles/${id}`, { method: "DELETE" });
    load();
    toast.success("已删除");
  };

  // Display name for the LLM in a profile card
  const profileLLMName = (p: JudgeProfile) =>
    p.llmConfig?.name ?? p.studentLLMConfig?.name ?? "未配置 LLM";

  if (loading) return <div><Navbar /></div>;

  return (
    <div>
      <Navbar breadcrumbs={[{ label: "评分器设置" }]} />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">评分器设置</h1>
            <p className="text-sm text-muted-foreground mt-1">配置用于评分的 LLM 评分器</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={openNew}>+ 新建</Button>
          </div>
        </div>

        <div className="space-y-3">
          {profiles.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                <p className="mb-3">还没有评分器配置</p>
                <Button variant="outline" size="sm" onClick={openNew}>创建第一个</Button>
              </CardContent>
            </Card>
          )}
          {profiles.map((p) => {
            const testOk = p.lastTestStatus === "ok";
            const testFailed = p.lastTestStatus === "failed";
            return (
              <Card key={p.id}>
                <CardHeader className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{p.name}</CardTitle>
                        <Badge variant="outline" className="text-xs">
                          {p.type === "OBJECTIVE" ? "客观题 (0/1)" : "主观题 (0~1)"}
                        </Badge>
                      </div>
                      <CardDescription className="mt-1">
                        {profileLLMName(p)} · 模型：{p.model || "未设置"}
                        {" · "}Thinking：{p.enableThinking ? `开${p.thinkingBudget != null ? `(budget=${p.thinkingBudget})` : ""}` : "关"}
                        {p.temperature != null ? ` · T=${p.temperature}` : ""}
                      </CardDescription>
                      <div className="mt-2">
                        {!p.lastTestStatus && <span className="text-xs text-muted-foreground">未测试</span>}
                        {testOk && (
                          <div className="text-xs text-green-700">
                            <span className="font-medium">✓ 测试通过</span>
                            {p.lastTestedAt && <span className="text-muted-foreground ml-1">{new Date(p.lastTestedAt).toLocaleString("zh-CN")}</span>}
                            {p.lastTestMessage && (
                              <div title={p.lastTestMessage} className="text-muted-foreground bg-muted rounded p-1.5 font-mono text-[11px] mt-1 max-w-sm truncate">{p.lastTestMessage}</div>
                            )}
                          </div>
                        )}
                        {testFailed && (
                          <div className="text-xs text-destructive">
                            <span className="font-medium">✗ 测试失败</span>
                            {p.lastTestedAt && <span className="text-muted-foreground ml-1">{new Date(p.lastTestedAt).toLocaleString("zh-CN")}</span>}
                            {p.lastTestMessage && (
                              <div title={p.lastTestMessage} className="bg-red-50 rounded p-1.5 font-mono text-[11px] mt-1 max-w-sm truncate">{p.lastTestMessage}</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant={testOk ? "outline" : testFailed ? "destructive" : "default"}
                        size="sm"
                        onClick={() => test(p.id)}
                        disabled={testing === p.id}
                      >
                        {testing === p.id ? "测试中..." : "测试连接"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(p)}>编辑</Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => del(p.id)}>删除</Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>

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
    </div>
  );
}
