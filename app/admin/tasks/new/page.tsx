"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { toast } from "sonner";

interface JudgeProfile {
  id: string;
  name: string;
  type: string;
}

interface LLMConfig {
  id: string;
  name: string;
  models: string;
}

interface Bank {
  id: string;
  name: string;
  _count: { items: number };
}

export default function NewTaskPage() {
  const { user, loading, authFetch } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [maxPrelimSubs, setMaxPrelimSubs] = useState(3);
  const [maxFinalSubs, setMaxFinalSubs] = useState(3);
  const [topNForFinals, setTopNForFinals] = useState(10);
  const [maxTrialRuns, setMaxTrialRuns] = useState(15);
  const [judgeProfiles, setJudgeProfiles] = useState<JudgeProfile[]>([]);
  const [judgeProfileId, setJudgeProfileId] = useState("");
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankId, setBankId] = useState("");
  const [llmConfigs, setLlmConfigs] = useState<LLMConfig[]>([]);
  const [adminLLMEnabled, setAdminLLMEnabled] = useState(false);
  const [adminStudentLLMConfigId, setAdminStudentLLMConfigId] = useState("");
  const [adminModel, setAdminModel] = useState("");
  const [adminEnableThinking, setAdminEnableThinking] = useState(false);
  const [adminThinkingBudget, setAdminThinkingBudget] = useState("");
  const [adminTemperature, setAdminTemperature] = useState("");
  const [adminMaxTokens, setAdminMaxTokens] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role !== "ADMIN" && !user.canPublish) router.replace("/not-found");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    authFetch("/api/admin/judge-profiles")
      .then((r) => r.json())
      .then((data) => setJudgeProfiles(data.profiles || []));
    authFetch("/api/student/llm-config")
      .then((r) => r.json())
      .then((data) => setLlmConfigs(data.configs || []));
    authFetch("/api/user/question-banks")
      .then((r) => r.json())
      .then((data) => setBanks(data.personalBanks || []));
  }, [user, authFetch]); // eslint-disable-line

  const handleCreate = async () => {
    if (!title) return toast.error("标题不能为空");
    setSaving(true);
    try {
      const res = await authFetch("/api/admin/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          bankId: bankId || null,
          judgeProfileId: judgeProfileId || null,
          maxPrelimSubs,
          maxFinalSubs,
          topNForFinals,
          maxTrialRuns,
          adminLLMEnabled,
          adminStudentLLMConfigId: adminStudentLLMConfigId || null,
          adminModel: adminModel || null,
          adminEnableThinking,
          adminThinkingBudget: adminThinkingBudget ? Number(adminThinkingBudget) : null,
          adminTemperature: adminTemperature ? Number(adminTemperature) : null,
          adminMaxTokens: adminMaxTokens ? Number(adminMaxTokens) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("任务创建成功");
      router.push(`/admin/tasks/${data.task.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSaving(false);
    }
  };

  const selectedLLM = llmConfigs.find((c) => c.id === adminStudentLLMConfigId);

  if (loading) return <div><Navbar backHref="/dashboard" backLabel="活动广场" /></div>;

  return (
    <div>
      <Navbar backHref="/dashboard" backLabel="活动广场" breadcrumbs={[{ label: "新建任务" }]} />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">新建任务</h1>
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
            <CardDescription>创建后可在任务管理页添加题目、配置详情</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>任务标题 *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：客服对话评估" />
            </div>
            <div className="space-y-2">
              <Label>任务描述</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="任务说明..." />
            </div>

            <div className="space-y-2">
              <Label>题库（可选）</Label>
              <Select value={bankId} onValueChange={(v) => setBankId(v === "__none__" ? "" : (v ?? ""))}>
                <SelectTrigger>
                  <span className={`flex-1 text-left text-sm ${!bankId ? "text-muted-foreground" : ""}`}>
                    {bankId
                      ? (() => { const b = banks.find((b) => b.id === bankId); return b ? `${b.name}（${b._count.items} 题）` : ""; })()
                      : "暂时留空，后续在任务页配置"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">暂时留空，后续在任务页配置</SelectItem>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}（{b._count.items} 题）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {banks.length === 0 && (
                <p className="text-xs text-muted-foreground">暂无题库，可在任务创建后手动添加题目。</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>评分器</Label>
              <Select value={judgeProfileId} onValueChange={(v) => setJudgeProfileId(v || "")}>
                <SelectTrigger>
                  <span className={`flex-1 text-left text-sm ${!judgeProfileId ? "text-muted-foreground" : ""}`}>
                    {judgeProfiles.find((p) => p.id === judgeProfileId)
                      ? `${judgeProfiles.find((p) => p.id === judgeProfileId)!.name}（${judgeProfiles.find((p) => p.id === judgeProfileId)!.type === "OBJECTIVE" ? "客观题 0/1" : "主观题 0~1"}）`
                      : "选择评分器（留空后续配置）"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {judgeProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}（{p.type === "OBJECTIVE" ? "客观题 0/1" : "主观题 0~1"}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {judgeProfiles.length === 0 && (
                <p className="text-xs text-amber-600">
                  还没有评分器，请先{" "}
                  <button className="underline" onClick={() => router.push("/account/judge-profiles")}>
                    创建评分器
                  </button>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>海选最多提交次数</Label>
                <Input type="number" min={1} value={maxPrelimSubs} onChange={(e) => setMaxPrelimSubs(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>终赛最多提交次数</Label>
                <Input type="number" min={1} value={maxFinalSubs} onChange={(e) => setMaxFinalSubs(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>晋级终赛人数</Label>
                <Input type="number" min={1} value={topNForFinals} onChange={(e) => setTopNForFinals(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>试跑次数上限</Label>
                <Input type="number" min={0} value={maxTrialRuns} onChange={(e) => setMaxTrialRuns(Number(e.target.value))} />
              </div>
            </div>

            <div className="border-t pt-4 mt-2">
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  id="adminLLMEnabled"
                  checked={adminLLMEnabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setAdminLLMEnabled(enabled);
                    if (!enabled) {
                      setAdminStudentLLMConfigId("");
                      setAdminModel("");
                      setAdminEnableThinking(false);
                      setAdminThinkingBudget("");
                      setAdminTemperature("");
                      setAdminMaxTokens("");
                    }
                  }}
                  className="h-4 w-4"
                />
                <Label htmlFor="adminLLMEnabled" className="cursor-pointer font-medium">
                  启用「管理员指定」接入方式
                </Label>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                开启后，参赛者统一使用下方 LLM 接入，但仍可自行填写系统提示词。
              </p>
              {adminLLMEnabled && (
                <div className="space-y-3 pl-2 border-l-2 border-muted">
                  <div className="space-y-1.5">
                    <Label>LLM 提供商 *</Label>
                    <Select
                      value={adminStudentLLMConfigId}
                      onValueChange={(v) => {
                        const cfg = llmConfigs.find((c) => c.id === v);
                        setAdminStudentLLMConfigId(v ?? "");
                        setAdminModel(cfg?.models.split(",")[0]?.trim() ?? "");
                      }}
                    >
                      <SelectTrigger>
                        <span className={`flex-1 text-left text-sm ${!adminStudentLLMConfigId ? "text-muted-foreground" : ""}`}>
                          {selectedLLM?.name || "选择 LLM 配置"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {llmConfigs.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {llmConfigs.length === 0 && (
                      <p className="text-xs text-amber-600">
                        还没有 LLM 账号，请先{" "}
                        <button className="underline" onClick={() => router.push("/account/llm-config")}>
                          前往配置
                        </button>
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>模型 *</Label>
                    {adminStudentLLMConfigId && selectedLLM?.models ? (
                      <Select
                        value={adminModel}
                        onValueChange={(v) => setAdminModel(v ?? "")}
                      >
                        <SelectTrigger>
                          <span className={`flex-1 text-left text-sm ${!adminModel ? "text-muted-foreground" : ""}`}>
                            {adminModel || "选择模型"}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {(selectedLLM.models || "").split(",").map((m) => m.trim()).filter(Boolean).map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={adminModel}
                        onChange={(e) => setAdminModel(e.target.value)}
                        placeholder="输入模型名称"
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label>Temperature</Label>
                      <Input
                        type="number" min={0} max={2} step={0.1}
                        value={adminTemperature}
                        onChange={(e) => setAdminTemperature(e.target.value)}
                        placeholder="默认"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Max Tokens</Label>
                      <Input
                        type="number" min={256} step={256}
                        value={adminMaxTokens}
                        onChange={(e) => setAdminMaxTokens(e.target.value)}
                        placeholder="默认 2048"
                      />
                    </div>
                    <div className="flex items-end pb-1 gap-2">
                      <input
                        type="checkbox"
                        id="adminEnableThinking"
                        checked={adminEnableThinking}
                        onChange={(e) => setAdminEnableThinking(e.target.checked)}
                        className="h-4 w-4 mb-1"
                      />
                      <Label htmlFor="adminEnableThinking" className="cursor-pointer text-xs">
                        深度思考（并非所有模型支持）
                      </Label>
                    </div>
                    {adminEnableThinking && (
                      <div className="space-y-1.5">
                        <Label>Thinking Budget</Label>
                        <Input
                          type="number" min={256}
                          value={adminThinkingBudget}
                          onChange={(e) => setAdminThinkingBudget(e.target.value)}
                          placeholder="默认 1024"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Button onClick={handleCreate} disabled={saving} className="w-full">
              {saving ? "创建中..." : "创建任务"}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
