"use client";
import { use, useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import Link from "next/link";
import { getScoreColors } from "@/lib/scoreColors";
import { SysErrTooltip, classifyError, stripTechnicalDetails } from "@/components/SysErrTooltip";
import { ConnectivityTestDialog } from "@/components/ConnectivityTestDialog";

// ────────── Types ──────────
interface Task {
  id: string; title: string; description: string; status: string;
  maxPrelimSubs: number; maxFinalSubs: number; maxTrialRuns: number;
  adminLLMEnabled: boolean;
  adminLLMConfig: { id: string; name: string } | null;
  adminModel: string | null;
  adminPrompt: string | null;
  adminEnableThinking: boolean;
  adminThinkingBudget: number | null;
  adminTemperature: number | null;
}

interface Enrollment {
  id: string; mode: string; isFinalist: boolean;
  studentLLMConfigId: string | null;
  studentLLMConfig: { id: string; name: string; models: string } | null;
  model: string | null; prompt: string | null;
  enableThinking: boolean; thinkingBudget: number | null; temperature: number | null; maxTokens: number | null;
  difyEndpoint: string | null; difyApiKey: string | null;
  cozeEndpoint: string | null; cozeApiKey: string | null; cozeBotId: string | null;
  trialRunsUsed: number;
}

interface LLMConfig { id: string; name: string; models: string; }

interface Question { id: string; content: string; answer: string | null; orderIndex: number; }

interface Submission {
  id: string; phase: string; status: string; version: number; isFinal: boolean;
  publicScore: number | null; createdAt: string; promptSnapshot: string | null;
  errorMessage: string | null;
  _count: { answers: number };
}

interface Answer {
  id: string; rawInput: string | null; rawThinking: string | null; rawOutput: string; score: number | null; judgeReason: string | null;
  question: { id: string; content: string; split: string; orderIndex: number };
}

interface LeaderboardEntry {
  rank: number; userId: string; name: string;
  publicScore: number; privateScore: number | null;
  submittedAt: string; submissionCount: number;
}

// ────────── Constants ──────────
const STATUS_LABEL: Record<string, string> = {
  PRELIMINARY: "海选中", FINALS: "终赛", ENDED: "已结束",
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  PENDING: { label: "等待中", variant: "outline" },
  RUNNING: { label: "运行中", variant: "default" },
  COMPLETED: { label: "完成", variant: "secondary" },
  FAILED: { label: "失败", variant: "destructive" },
  SYSERR: { label: "系统错误", variant: "destructive" },
};

const MODE_LABELS: Record<string, string> = {
  ADMIN_LLM: "管理员指定", OPENAI_COMPATIBLE: "LLM（OpenAI API）", DIFY: "Dify Chatbot", COZE: "Coze Chatbot",
};


function looksLikeTwentyFourPointQuestion(content: string) {
  const nums = content.match(/-?\d+(?:\.\d+)?/g) ?? [];
  const stripped = content.replace(/-?\d+(?:\.\d+)?/g, "").replace(/[\s,，、;；:：|/\\()[\]{}.+\-*]/g, "");
  return nums.length === 4 && stripped.length === 0;
}

function shouldUseTwentyFourPointPrompt(questions: Question[]) {
  return questions.length > 0 && questions.slice(0, 5).every((q) => looksLikeTwentyFourPointQuestion(q.content));
}

// ────────── Main Page ──────────
export default function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading, authFetch, locale } = useAuth();
  const router = useRouter();

  const [task, setTask] = useState<Task | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [llmConfigs, setLLMConfigs] = useState<LLMConfig[]>([]);
  const [publicQuestions, setPublicQuestions] = useState<Question[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [finalsLeaderboard, setFinalsLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [awardLeaderboard, setAwardLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isEnded, setIsEnded] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  const loadTask = useCallback(() =>
    authFetch(`/api/tasks/${id}`).then((r) => r.json()).then((d) => setTask(d.task)), [authFetch, id]);

  const loadEnrollment = useCallback(() =>
    authFetch(`/api/tasks/${id}/enrollment`).then((r) => r.json()).then((d) => setEnrollment(d.enrollment ?? null)), [authFetch, id]);

  const loadSubmissions = useCallback(() =>
    authFetch(`/api/tasks/${id}/submissions`).then((r) => r.json())
      .then((d) => setSubmissions(d.submissions || [])), [authFetch, id]);

  // Auto-poll while any submission is pending/running
  useEffect(() => {
    const hasActive = submissions.some((s) => s.status === "PENDING" || s.status === "RUNNING");
    if (!hasActive) return;
    const timer = setInterval(loadSubmissions, 3000);
    return () => clearInterval(timer);
  }, [submissions, loadSubmissions]);

  const loadLeaderboard = useCallback(() =>
    Promise.all([
      authFetch(`/api/tasks/${id}/leaderboard`).then((r) => r.json()),
      authFetch(`/api/tasks/${id}/leaderboard?phase=FINALS`).then((r) => r.json()),
    ]).then(([prelim, finals]) => {
      setLeaderboard(prelim.leaderboard || []);
      setFinalsLeaderboard(finals.leaderboard || []);
      setIsEnded(prelim.isEnded || false);
    }), [authFetch, id]);

  const loadAwardLeaderboard = useCallback(async () => {
    const finalsData = await authFetch(`/api/tasks/${id}/leaderboard?phase=FINALS`).then((r) => r.json());
    setIsEnded(finalsData.isEnded || false);
    if (finalsData.hasFinalsSubmissions) {
      setAwardLeaderboard(finalsData.leaderboard || []);
    } else {
      const prelimData = await authFetch(`/api/tasks/${id}/leaderboard`).then((r) => r.json());
      setAwardLeaderboard(prelimData.leaderboard || []);
    }
  }, [authFetch, id]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      authFetch(`/api/tasks/${id}`).then((r) => r.json()),
      authFetch(`/api/tasks/${id}/enrollment`).then((r) => r.json()),
      authFetch("/api/student/llm-config").then((r) => r.json()),
      authFetch(`/api/tasks/${id}/questions`).then((r) => r.json()),
      authFetch(`/api/tasks/${id}/submissions`).then((r) => r.json()),
    ]).then(([taskData, enrollData, configData, qData, subData]) => {
      setTask(taskData.task);
      setEnrollment(enrollData.enrollment ?? null);
      setLLMConfigs(configData.configs || []);
      setPublicQuestions(qData.questions || []);
      setSubmissions(subData.submissions || []);
    }).finally(() => setFetching(false));
  }, [user, id]); // eslint-disable-line

  if (loading || fetching || !task || !user) {
    return <div><Navbar backHref="/dashboard" backLabel="任务列表" /></div>;
  }

  const isEnrolled = !!enrollment;
  const phase = task.status === "FINALS" ? "FINALS" : "PRELIMINARY";
  const isLockedForFinals = phase === "FINALS" && enrollment?.isFinalist === false;
  const canSubmit = (task.status === "PRELIMINARY" || task.status === "FINALS") && !isLockedForFinals;
  const maxSubs = phase === "FINALS" ? task.maxFinalSubs : task.maxPrelimSubs;
  const phaseSubs = submissions.filter((s) => s.phase === phase && s.status !== "FAILED" && s.status !== "SYSERR");

  return (
    <div>
      <Navbar backHref="/dashboard" backLabel="任务列表" breadcrumbs={[{ label: task.title }]} />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{task.title}</h1>
            {task.description && <p className="text-muted-foreground mt-1 text-sm">{task.description}</p>}
          </div>
          <Badge variant={task.status === "ENDED" ? "secondary" : "default"}>
            {STATUS_LABEL[task.status] ?? task.status}
          </Badge>
        </div>

        <Tabs defaultValue="enroll">
          <div className="flex items-center gap-2 mb-4">
            <TabsList>
              <TabsTrigger value="enroll">报名 {isEnrolled ? "✓" : ""}</TabsTrigger>
              <TabsTrigger value="chatbot" disabled={!isEnrolled}>Chatbot 配置</TabsTrigger>
              <TabsTrigger value="submit" disabled={!isEnrolled}>答题/提交</TabsTrigger>
              <TabsTrigger value="leaderboard" onClick={loadLeaderboard}>排行榜</TabsTrigger>
              <TabsTrigger value="award" onClick={loadAwardLeaderboard}>颁奖</TabsTrigger>
            </TabsList>
            <Button
              variant="outline" size="sm"
              onClick={() => { loadTask(); loadEnrollment(); loadSubmissions(); loadLeaderboard(); }}
            >↻ 刷新</Button>
          </div>

          {/* ── 报名 Tab ── */}
          <TabsContent value="enroll">
            <EnrollTab
              taskId={id}
              taskStatus={task.status}
              isEnrolled={isEnrolled}
              onEnrolled={(e) => setEnrollment(e)}
              onWithdrawn={() => setEnrollment(null)}
              authFetch={authFetch}
            />
          </TabsContent>

          {/* ── Chatbot 配置 Tab ── */}
          <TabsContent value="chatbot">
            {enrollment && (
              <ChatbotTab
                taskId={id}
                task={task}
                enrollment={enrollment}
                llmConfigs={llmConfigs}
                onSaved={(e) => setEnrollment(e)}
                authFetch={authFetch}
              />
            )}
          </TabsContent>

          {/* ── 答题 Tab ── */}
          <TabsContent value="submit">
            {enrollment && (
              <SubmitTab
                taskId={id}
                task={task}
                enrollment={enrollment}
                publicQuestions={publicQuestions}
                submissions={submissions}
                canSubmit={canSubmit}
                phaseSubs={phaseSubs}
                maxSubs={maxSubs}
                phase={phase}
                currentUserId={user.id}
                onSaved={(e) => setEnrollment(e)}
                onSubmitted={() => loadSubmissions()}
                llmConfigs={llmConfigs}
                authFetch={authFetch}
              />
            )}
          </TabsContent>

          {/* ── 排行榜 Tab ── */}
          <TabsContent value="leaderboard">
            <LeaderboardTab
              leaderboard={leaderboard}
              finalsLeaderboard={finalsLeaderboard}
              taskStatus={task.status}
              isEnded={isEnded}
              currentUserId={user.id}
              onRefresh={loadLeaderboard}
            />
          </TabsContent>

          {/* ── 颁奖 Tab ── */}
          <TabsContent value="award">
            <StudentAwardTab leaderboard={awardLeaderboard} isEnded={isEnded} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ────────── 报名 Tab ──────────
function EnrollTab({
  taskId, taskStatus, isEnrolled, onEnrolled, onWithdrawn, authFetch,
}: {
  taskId: string; taskStatus: string; isEnrolled: boolean;
  onEnrolled: (e: Enrollment) => void; onWithdrawn: () => void;
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
}) {
  const [saving, setSaving] = useState(false);

  const handleEnroll = async () => {
    setSaving(true);
    try {
      const res = await authFetch(`/api/tasks/${taskId}/enrollment`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onEnrolled(data.enrollment);
      toast.success("报名成功！请前往「Chatbot 配置」设置接入方式。");
    } catch (e) { toast.error(e instanceof Error ? e.message : "报名失败"); }
    finally { setSaving(false); }
  };

  const handleWithdraw = async () => {
    setSaving(true);
    try {
      const res = await authFetch(`/api/tasks/${taskId}/enrollment`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      onWithdrawn();
      toast.success("已取消报名");
    } catch (e) { toast.error(e instanceof Error ? e.message : "操作失败"); }
    finally { setSaving(false); }
  };

  const canEnroll = taskStatus === "PRELIMINARY";
  const canWithdraw = taskStatus === "PRELIMINARY";

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>报名状态</CardTitle>
          <Badge variant={isEnrolled ? "default" : "outline"}>
            {isEnrolled ? "已报名" : "未报名"}
          </Badge>
        </div>
        <CardDescription>
          {taskStatus === "PRELIMINARY" ? "海选阶段开放中" :
            taskStatus === "FINALS" ? "终赛进行中" :
              "当前不在报名阶段"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isEnrolled && canEnroll && (
          <Button onClick={handleEnroll} disabled={saving}>
            {saving ? "报名中..." : "确认报名"}
          </Button>
        )}
        {isEnrolled && canWithdraw && (
          <Button variant="outline" onClick={handleWithdraw} disabled={saving}>
            {saving ? "操作中..." : "取消报名"}
          </Button>
        )}
        {isEnrolled && !canWithdraw && (
          <p className="text-sm text-muted-foreground">已报名参赛</p>
        )}
        {!isEnrolled && !canEnroll && (
          <p className="text-sm text-muted-foreground">当前不在报名阶段</p>
        )}
      </CardContent>
    </Card>
  );
}

// ────────── Admin LLM Chatbot Card (管理员指定模式) ──────────
function AdminLLMChatbotCard({ task }: { task: Task }) {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="text-base">接入方式：管理员指定</CardTitle>
        <CardDescription>
          本活动统一使用以下 LLM，请前往「答题」页面填写你的 Prompt 并提交。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        {task.adminLLMConfig && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24 shrink-0">LLM 提供商</span>
            <span>{task.adminLLMConfig.name}</span>
          </div>
        )}
        {task.adminModel && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24 shrink-0">模型</span>
            <span className="font-mono">{task.adminModel}</span>
          </div>
        )}
        {task.adminEnableThinking && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24 shrink-0">深度思考</span>
            <span>已开启{task.adminThinkingBudget ? `（budget: ${task.adminThinkingBudget}）` : ""}</span>
          </div>
        )}
        {task.adminTemperature != null && (
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Temperature</span>
            <span>{task.adminTemperature}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────── Chatbot 配置 Tab ──────────
function ChatbotTab({
  taskId, task, enrollment, llmConfigs, onSaved, authFetch,
}: {
  taskId: string; task: Task; enrollment: Enrollment; llmConfigs: LLMConfig[];
  onSaved: (e: Enrollment) => void;
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
}) {
  if (task.adminLLMEnabled) {
    return <AdminLLMChatbotCard task={task} />;
  }

  const [mode, setMode] = useState(
    (enrollment.mode && enrollment.mode !== "ADMIN_LLM") ? enrollment.mode : "OPENAI_COMPATIBLE"
  );
  const [selectedConfigId, setSelectedConfigId] = useState(enrollment.studentLLMConfigId || "");
  const [model, setModel] = useState(enrollment.model || "");
  const [enableThinking, setEnableThinking] = useState(enrollment.enableThinking ?? false);
  const [thinkingBudget, setThinkingBudget] = useState(enrollment.thinkingBudget != null ? String(enrollment.thinkingBudget) : "");
  const [temperature, setTemperature] = useState(enrollment.temperature != null ? String(enrollment.temperature) : "");
  const [maxTokens, setMaxTokens] = useState(enrollment.maxTokens != null ? String(enrollment.maxTokens) : "");
  const [difyEndpoint, setDifyEndpoint] = useState(enrollment.difyEndpoint || "https://api.dify.ai/v1");
  const [difyApiKey, setDifyApiKey] = useState(enrollment.difyApiKey || "");
  const [cozeEndpoint, setCozeEndpoint] = useState(enrollment.cozeEndpoint || "https://api.coze.cn");
  const [cozeApiKey, setCozeApiKey] = useState(enrollment.cozeApiKey || "");
  const [cozeBotId, setCozeBotId] = useState(enrollment.cozeBotId || "");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [testDialog, setTestDialog] = useState<{ open: boolean; status: "testing" | "success" | "fail"; message?: string; preview?: string }>({ open: false, status: "testing" });

  const selectedCfg = llmConfigs.find((c) => c.id === selectedConfigId);
  const availableModels = selectedCfg?.models.split(",").map((m) => m.trim()).filter(Boolean) ?? [];

  const doSave = async () => {
    const tempVal = temperature !== "" ? parseFloat(temperature) : null;
    const budgetVal = thinkingBudget !== "" ? parseInt(thinkingBudget) : null;
    const maxTokensVal = maxTokens !== "" ? parseInt(maxTokens) : null;
    const res = await authFetch(`/api/tasks/${taskId}/enrollment`, {
      method: "PUT",
      body: JSON.stringify({ mode, studentLLMConfigId: selectedConfigId || null, model, enableThinking, thinkingBudget: budgetVal, temperature: tempVal, maxTokens: maxTokensVal, difyEndpoint, difyApiKey, cozeEndpoint, cozeApiKey, cozeBotId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    onSaved({ ...enrollment, mode, studentLLMConfigId: selectedConfigId || null, model, enableThinking, thinkingBudget: budgetVal, temperature: tempVal, maxTokens: maxTokensVal, difyEndpoint, difyApiKey, cozeEndpoint, cozeApiKey, cozeBotId, studentLLMConfig: selectedCfg ? { id: selectedCfg.id, name: selectedCfg.name, models: selectedCfg.models } : null, prompt: enrollment.prompt });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await doSave();
      toast.success("配置已保存");
    } catch (e) { toast.error(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  };

  const handleValidate = async () => {
    setValidating(true);
    setTestDialog({ open: true, status: "testing" });
    try {
      await doSave();
      const [res] = await Promise.all([
        authFetch(`/api/tasks/${taskId}/enrollment/validate`, { method: "POST" }),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
      const data = await (res as Response).json();
      if (data.ok) {
        setTestDialog({ open: true, status: "success", preview: data.preview });
        setTimeout(() => setTestDialog((v) => ({ ...v, open: false })), 2000);
      } else {
        setTestDialog({ open: true, status: "fail", message: data.message || "连接失败" });
      }
    } catch (e) {
      setTestDialog({ open: true, status: "fail", message: e instanceof Error ? e.message : "保存或测试失败" });
    } finally { setValidating(false); }
  };

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Chatbot 接入配置</CardTitle>
        <CardDescription>选择接入方式，配置好后可点击「连通性测试」验证</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>接入方式</Label>
          <Select value={mode} onValueChange={(v) => v && setMode(v)}>
            <SelectTrigger>
              <span className="flex-1 text-left text-sm">{MODE_LABELS[mode] ?? mode}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPENAI_COMPATIBLE">LLM（OpenAI 兼容 API）</SelectItem>
              <SelectItem value="DIFY">Dify Chatbot</SelectItem>
              <SelectItem value="COZE">Coze Chatbot</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {mode === "OPENAI_COMPATIBLE" && (
          <>
            <div className="rounded border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              OpenAI 兼容接口通常填写到 <code className="rounded bg-white/70 px-1">/v1</code> 层级，例如{" "}
              <code className="rounded bg-white/70 px-1">https://api.example.com/v1</code>；模型名需要和服务商控制台中的名称一致。
            </div>
            {llmConfigs.length === 0 ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                ⚠️ 还没有添加 LLM 账号。
                <Link href="/account/llm-config" className="underline font-medium ml-1">去添加</Link>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>选择 LLM 账号</Label>
                <Select value={selectedConfigId} onValueChange={(v) => { setSelectedConfigId(v ?? ""); setModel(""); }}>
                  <SelectTrigger>
                    <span className={`flex-1 text-left text-sm ${!selectedConfigId ? "text-muted-foreground" : ""}`}>
                      {llmConfigs.find((c) => c.id === selectedConfigId)?.name || "选择账号"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {llmConfigs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>选择模型</Label>
              {availableModels.length > 0 ? (
                <Select value={model} onValueChange={(v) => v && setModel(v)}>
                  <SelectTrigger>
                    <span className={`flex-1 text-left text-sm ${!model ? "text-muted-foreground" : ""}`}>
                      {model || "选择模型"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
              )}
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableThinking}
                  onChange={(e) => setEnableThinking(e.target.checked)}
                  className="h-4 w-4 rounded border"
                />
                <span className="text-sm">开启深度思考（Thinking）</span>
              </label>
              <p className="text-xs text-muted-foreground pl-6">仅 Qwen3 等支持 CoT 的模型有效；不支持的模型开启无效</p>
            </div>
            {enableThinking && (
              <div className="space-y-1.5">
                <Label>Thinking Budget（留空默认 1024）</Label>
                <Input
                  value={thinkingBudget}
                  onChange={(e) => setThinkingBudget(e.target.value)}
                  placeholder="1024"
                  type="number"
                  min="0"
                  step="256"
                  className="w-48"
                />
                <p className="text-xs text-muted-foreground">限制 CoT 最多使用的 token 数。留空 = 1024。不支持 Thinking 的模型此项无效</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Temperature（留空使用模型默认值）</Label>
              <Input
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                placeholder="0.7"
                type="number"
                min="0"
                max="2"
                step="0.1"
                className="w-32"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max Tokens（留空默认 2048）</Label>
              <Input
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                placeholder="2048"
                type="number"
                min="256"
                step="256"
                className="w-32"
              />
            </div>
          </>
        )}

        {mode === "DIFY" && (
          <>
            <div className="rounded border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
              题目内容将直接发送给 Dify Chatbot，请在 Dify 平台配置好 Chatbot 逻辑；如果是 24 点题目，请明确要求“每个数字恰好使用一次，构造等于 24 的表达式”。{" "}
              <a href="https://docs.dify.ai/zh/use-dify/publish/developing-with-apis" target="_blank" rel="noopener noreferrer" className="underline font-medium">参考文档 →</a>
            </div>
            <div className="space-y-1.5">
              <Label>Dify API Endpoint</Label>
              <Input value={difyEndpoint} onChange={(e) => setDifyEndpoint(e.target.value)} placeholder="https://api.dify.ai/v1" />
              <p className="text-xs text-muted-foreground">填写应用 API Endpoint，例如 https://api.dify.ai/v1；系统会自动调用 /chat-messages，通常不要粘贴带查询参数的完整请求 URL。</p>
            </div>
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input type="password" value={difyApiKey} onChange={(e) => setDifyApiKey(e.target.value)} placeholder="app-..." />
            </div>
          </>
        )}

        {mode === "COZE" && (
          <>
            <div className="rounded border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
              题目内容将直接发送给 Coze Bot，请在 Coze 平台配置好 Bot 逻辑；如果是 24 点题目，请明确要求“每个数字恰好使用一次，构造等于 24 的表达式”。{" "}
              <a href="https://www.coze.cn/open/docs/guides/publish_agent_api" target="_blank" rel="noopener noreferrer" className="underline font-medium">参考文档 →</a>
            </div>
            <div className="space-y-1.5">
              <Label>Coze API Endpoint</Label>
              <Input value={cozeEndpoint} onChange={(e) => setCozeEndpoint(e.target.value)} placeholder="https://api.coze.cn" />
              <p className="text-xs text-muted-foreground">填写 Coze API 域名，例如 https://api.coze.cn；Bot ID、API Key 从 Coze 发布后的 API 配置中获取。</p>
            </div>
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input type="password" value={cozeApiKey} onChange={(e) => setCozeApiKey(e.target.value)} placeholder="..." />
            </div>
            <div className="space-y-1.5">
              <Label>Bot ID</Label>
              <Input value={cozeBotId} onChange={(e) => setCozeBotId(e.target.value)} placeholder="..." />
            </div>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存配置"}</Button>
          <Button variant="outline" onClick={handleValidate} disabled={validating}>{validating ? "测试中..." : "连通性测试"}</Button>
        </div>
      </CardContent>
      <ConnectivityTestDialog
        open={testDialog.open}
        status={testDialog.status}
        message={testDialog.message}
        preview={testDialog.preview}
        onClose={() => { setTestDialog({ open: false, status: "testing" }); }}
      />
    </Card>
  );
}

// ────────── 答题 Tab ──────────
function SubmitTab({
  taskId, task, enrollment, publicQuestions, submissions, canSubmit,
  phaseSubs, maxSubs, phase, currentUserId, onSaved, onSubmitted, llmConfigs, authFetch,
}: {
  taskId: string; task: Task; enrollment: Enrollment;
  publicQuestions: Question[]; submissions: Submission[];
  canSubmit: boolean; phaseSubs: Submission[]; maxSubs: number; phase: string;
  currentUserId: string;
  onSaved: (e: Enrollment) => void;
  onSubmitted: () => void;
  llmConfigs: LLMConfig[];
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
}) {
  const { t, locale } = useAuth();  const isTwentyFourPointTask = shouldUseTwentyFourPointPrompt(publicQuestions);
  const twentyFourPrompt = t("template.twentyFourPrompt");
  const recommendedPrompt = isTwentyFourPointTask ? twentyFourPrompt : "Please answer the following question:\n\n{{question}}";
  const [prompt, setPrompt] = useState(enrollment.prompt || (enrollment.mode === "OPENAI_COMPATIBLE" && isTwentyFourPointTask ? twentyFourPrompt : ""));
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validateDialog, setValidateDialog] = useState<{ open: boolean; status: "testing" | "success" | "fail"; message?: string }>({ open: false, status: "testing" });
  const [progressSubId, setProgressSubId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ completed: number; total: number; currentQuestion?: string; phase?: string; done?: boolean }>({ completed: 0, total: 0 });
  const [progressDone, setProgressDone] = useState(false);
  const [detailSub, setDetailSub] = useState<{ answers: Answer[]; promptSnapshot?: string | null } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Trial run state
  const [trialOpen, setTrialOpen] = useState(false);
  const [trialQuestion, setTrialQuestion] = useState("");
  const [trialState, setTrialState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [trialOutput, setTrialOutput] = useState("");
  const [trialThinking, setTrialThinking] = useState("");
  const [trialError, setTrialError] = useState("");
  const [trialEval, setTrialEval] = useState<{ score: number | null; reason: string | null } | null>(null);
  const [trialRunsUsed, setTrialRunsUsed] = useState(enrollment.trialRunsUsed);
  const [evaluating, setEvaluating] = useState(false);
  const [trialEffectivePrompt, setTrialEffectivePrompt] = useState<string>("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [trialLLMInput, setTrialLLMInput] = useState<any>(null);
  const trialGenRef = useRef(0);

  useEffect(() => () => { eventSourceRef.current?.close(); }, []);

  const cfgName = task.adminLLMEnabled
    ? `管理员指定 · ${task.adminModel || "未配置模型"}`
    : enrollment.mode === "OPENAI_COMPATIBLE"
      ? `${enrollment.studentLLMConfig?.name ?? "未选账号"} · ${enrollment.model || "未选模型"}`
      : enrollment.mode === "DIFY" ? "Dify Chatbot"
        : enrollment.mode === "COZE" ? "Coze Chatbot" : enrollment.mode;

  const savePrompt = async () => {
    setSavingPrompt(true);
    try {
      const res = await authFetch(`/api/tasks/${taskId}/enrollment`, {
        method: "PUT",
        body: JSON.stringify({
          mode: enrollment.mode,
          studentLLMConfigId: enrollment.studentLLMConfigId,
          model: enrollment.model,
          prompt,
          enableThinking: enrollment.enableThinking,
          thinkingBudget: enrollment.thinkingBudget,
          temperature: enrollment.temperature,
          difyEndpoint: enrollment.difyEndpoint,
          difyApiKey: enrollment.difyApiKey,
          cozeEndpoint: enrollment.cozeEndpoint,
          cozeApiKey: enrollment.cozeApiKey,
          cozeBotId: enrollment.cozeBotId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onSaved({ ...enrollment, prompt });
      toast.success("Prompt 已保存");
    } catch (e) { toast.error(e instanceof Error ? e.message : "保存失败"); }
    finally { setSavingPrompt(false); }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setValidateDialog({ open: true, status: "testing" });
    try {
      if ((task.adminLLMEnabled || enrollment.mode === "OPENAI_COMPATIBLE") && prompt !== (enrollment.prompt || "")) {
        const saveRes = await authFetch(`/api/tasks/${taskId}/enrollment`, {
          method: "PUT",
          body: JSON.stringify({
            mode: enrollment.mode,
            studentLLMConfigId: enrollment.studentLLMConfigId,
            model: enrollment.model,
            prompt,
            enableThinking: enrollment.enableThinking,
            thinkingBudget: enrollment.thinkingBudget,
            temperature: enrollment.temperature,
            difyEndpoint: enrollment.difyEndpoint,
            difyApiKey: enrollment.difyApiKey,
            cozeEndpoint: enrollment.cozeEndpoint,
            cozeApiKey: enrollment.cozeApiKey,
            cozeBotId: enrollment.cozeBotId,
          }),
        });
        if (!saveRes.ok) throw new Error((await saveRes.json()).error || "Prompt 保存失败");
        onSaved({ ...enrollment, prompt });
      }

      const [valRes] = await Promise.all([
        authFetch(`/api/tasks/${taskId}/enrollment/validate`, { method: "POST" }),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
      const valData = await (valRes as Response).json().catch(() => ({}));
      if (!valData.ok) {
        setValidateDialog({ open: true, status: "fail", message: valData.message || "无法连接到 Chatbot" });
        return;
      }

      setValidateDialog({ open: true, status: "success" });
      await new Promise((r) => setTimeout(r, 800));
      setValidateDialog((v) => ({ ...v, open: false }));

      const res = await authFetch(`/api/tasks/${taskId}/submissions`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSubmitted();
      startProgress(data.submission.id);
      toast.success("提交成功，正在评测...");
    } catch (e) {
      setValidateDialog((v) => ({ ...v, open: false }));
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally { setSubmitting(false); }
  };

  const startProgress = (subId: string) => {
    eventSourceRef.current?.close();
    setProgressSubId(subId);
    setProgress({ completed: 0, total: 0, currentQuestion: "" });
    setProgressDone(false);
    const token = localStorage.getItem("arena_token");
    const es = new EventSource(`/api/submissions/${subId}/progress?token=${token}`);
    eventSourceRef.current = es;
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setProgress(data);
      if (data.done) { setProgressDone(true); es.close(); onSubmitted(); }
    };
    es.onerror = () => { es.close(); setProgressDone(true); onSubmitted(); };
  };

  useEffect(() => {
    if (progressSubId && !progressDone) return;
    const activeSub = phaseSubs.find((s) => s.status === "PENDING" || s.status === "RUNNING");
    if (activeSub) startProgress(activeSub.id);
  }, [phaseSubs, progressSubId, progressDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewDetail = async (subId: string) => {
    const res = await authFetch(`/api/submissions/${subId}`);
    const data = await res.json();
    setDetailSub(data.submission);
  };

  const toggleFinal = async (subId: string) => {
    const res = await authFetch(`/api/submissions/${subId}/final`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      onSubmitted();
      toast.success(data.isFinal ? "已设为最终提交" : "已取消最终提交");
    }
  };

  const openTrialForQuestion = (qId: string) => {
    setTrialQuestion(qId);
    setTrialState("idle");
    setTrialOutput("");
    setTrialThinking("");
    setTrialError("");
    setTrialEval(null);
    setTrialOpen(true);
    startTrial(qId);
  };

  const startTrial = async (qId?: string) => {
    const questionId = qId ?? trialQuestion;
    if (!questionId) return;
    const gen = ++trialGenRef.current;
    setTrialState("running");
    setTrialOutput("");
    setTrialThinking("");
    setTrialError("");
    setTrialEval(null);
    setTrialEffectivePrompt(prompt);
    setTrialLLMInput(null);

    // Always save current config before trial so the backend uses the latest prompt
    try {
      const saveRes = await authFetch(`/api/tasks/${taskId}/enrollment`, {
        method: "PUT",
        body: JSON.stringify({
          mode: enrollment.mode,
          studentLLMConfigId: enrollment.studentLLMConfigId,
          model: enrollment.model,
          prompt,
          enableThinking: enrollment.enableThinking,
          thinkingBudget: enrollment.thinkingBudget,
          temperature: enrollment.temperature,
          difyEndpoint: enrollment.difyEndpoint,
          difyApiKey: enrollment.difyApiKey,
          cozeEndpoint: enrollment.cozeEndpoint,
          cozeApiKey: enrollment.cozeApiKey,
          cozeBotId: enrollment.cozeBotId,
        }),
      });
      if (saveRes.ok) onSaved({ ...enrollment, prompt });
    } catch { /* save failed, trial will use last saved prompt */ }

    try {
      const res = await authFetch(`/api/tasks/${taskId}/enrollment/trial`, {
        method: "POST",
        body: JSON.stringify({ questionId, prompt }),
      });
      if (!res.ok) {
        const data = await res.json();
        setTrialError(data.error || "请求失败");
        setTrialState("error");
        return;
      }
      setTrialRunsUsed((n) => n + 1);

      const reader = res.body?.getReader();
      if (!reader) { setTrialError("无法读取响应"); setTrialState("error"); return; }

      const dec = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (trialGenRef.current !== gen) { reader.cancel(); return; }
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const event = JSON.parse(raw);
            if (event.type === "thinking") setTrialThinking((p) => p + event.content);
            else if (event.type === "content") setTrialOutput((p) => p + event.content);
            else if (event.type === "done") { if (event.llmInput) setTrialLLMInput(event.llmInput); setTrialState("done"); }
            else if (event.type === "error") { setTrialError(event.message); setTrialState("error"); }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      if (trialGenRef.current !== gen) return; // superseded, ignore error
      setTrialError(e instanceof Error ? e.message : "请求失败");
      setTrialState("error");
    }
  };

  const evaluateTrial = async () => {
    if (!trialOutput || !trialQuestion) return;
    setEvaluating(true);
    try {
      const res = await authFetch(`/api/tasks/${taskId}/enrollment/trial/evaluate`, {
        method: "POST",
        body: JSON.stringify({ questionId: trialQuestion, output: trialOutput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTrialEval({ score: data.score, reason: data.reason });
    } catch (e) { toast.error(e instanceof Error ? e.message : "评估失败"); }
    finally { setEvaluating(false); }
  };

  const isLockedForFinals = phase === "FINALS" && !enrollment.isFinalist;

  return (
    <div>
      {/* Phase / finalist status */}
      <div className="flex items-center gap-2 mb-4">
        {phase === "FINALS" ? (
          enrollment.isFinalist
            ? <Badge variant="default">终赛：晋级</Badge>
            : <Badge variant="outline" className="text-amber-700 border-amber-400">终赛：未晋级</Badge>
        ) : (
          <Badge variant="secondary">海选</Badge>
        )}
      </div>

      {isLockedForFinals && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-sm font-medium text-amber-800">您未晋级终赛，无法继续提交评测或试跑。</p>
          </CardContent>
        </Card>
      )}

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Left: questions + prompt editor */}
      <div className="space-y-3">
        {/* Chatbot mode indicator */}
        <Card className="border-muted">
          <CardContent className="py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">当前接入方式</p>
              <p className="text-sm font-medium">{cfgName}</p>
            </div>
          </CardContent>
        </Card>

        {/* Prompt editor — LLM / 管理员指定 mode */}
        {(task.adminLLMEnabled || enrollment.mode === "OPENAI_COMPATIBLE") && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Prompt 模板</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 space-y-2">
              {isTwentyFourPointTask && enrollment.mode === "OPENAI_COMPATIBLE" && (
                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  {t(“task.recommended24Prompt”)}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs"
                    onClick={() => setPrompt(twentyFourPrompt)}
                  >
                    {t("task.useRecommendedPrompt")}
                  </Button>
                </div>
              )}
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                placeholder={recommendedPrompt}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                {t("task.promptHelp")}
              </p>
              <Button size="sm" variant="outline" onClick={savePrompt} disabled={savingPrompt}>
                {savingPrompt ? "保存中..." : "保存 Prompt"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Public questions */}
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">公开题目（{publicQuestions.length}）</CardTitle>
              <span className="text-xs text-muted-foreground">
                剩余试跑次数：{Math.max(0, task.maxTrialRuns - trialRunsUsed)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pb-3">
            {publicQuestions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">暂无公开题目</p>
            ) : (
              <div className="space-y-2">
                {publicQuestions.map((q, i) => (
                  <div key={q.id} className="border rounded p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground mb-1">Q{i + 1}</p>
                        <p className="text-sm">{q.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">参考答案：{q.answer ?? "—"}</p>
                      </div>
                      <Button
                        size="sm" variant="outline"
                        className="h-6 px-2 text-xs shrink-0 mt-0.5"
                        onClick={() => openTrialForQuestion(q.id)}
                        disabled={isLockedForFinals || phaseSubs.length >= maxSubs}
                        title={isLockedForFinals ? "未晋级终赛，无法试跑" : phaseSubs.length >= maxSubs ? "已达提交上限，无法试跑" : undefined}
                      >
                        试跑
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trial run dialog */}
      <Dialog open={trialOpen} onOpenChange={(open) => { if (!open) setTrialOpen(false); }}>
        <DialogContent className="w-[90vw] max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              试跑 — Q{publicQuestions.findIndex((q) => q.id === trialQuestion) + 1}
            </DialogTitle>
          </DialogHeader>
          {trialQuestion && (
            <div className="space-y-3">
              <div className="rounded border bg-muted/50 p-2 text-xs text-muted-foreground">
                {publicQuestions.find((q) => q.id === trialQuestion)?.content}
              </div>

              {(trialState !== "idle" && (trialLLMInput || trialEffectivePrompt)) && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                    LLM 输入（实际发送）▸
                  </summary>
                  <pre className="mt-1 bg-muted rounded p-2 whitespace-pre-wrap font-mono overflow-x-auto max-h-48 overflow-y-auto text-xs">
                    {trialLLMInput
                      ? JSON.stringify(trialLLMInput, null, 2)
                      : (() => {
                          const qContent = publicQuestions.find((q) => q.id === trialQuestion)?.content ?? "";
                          const p = trialEffectivePrompt.trim();
                          let content: string;
                          if (!p) content = qContent;
                          else if (p.includes("{{question}}")) content = p.replace(/\{\{question\}\}/g, qContent);
                          else content = `${p}\n\n${qContent}`;
                          return JSON.stringify({ messages: [{ role: "user", content }] }, null, 2);
                        })()
                    }
                  </pre>
                </details>
              )}

              {trialState === "idle" && (
                <Button size="sm" onClick={() => startTrial()}>开始试跑</Button>
              )}

              {trialState === "error" && (
                <div className="space-y-2">
                  <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                    {trialError}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => startTrial()}>重试</Button>
                </div>
              )}

              {(trialState === "running" || trialState === "done") && (
                <div className="space-y-2">
                  {trialThinking && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-amber-700 hover:text-amber-900 select-none">
                        🧠 思考过程 ▸
                      </summary>
                      <pre className="mt-1 bg-amber-50 border border-amber-200 rounded p-2 whitespace-pre-wrap font-mono overflow-x-auto max-h-48 overflow-y-auto text-amber-900">{trialThinking}</pre>
                    </details>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                      {trialState === "running" && (
                        <span className="inline-block h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      )}
                      {trialState === "running" ? "生成中..." : "输出"}
                    </p>
                    <div className="bg-muted rounded p-2 text-xs font-mono whitespace-pre-wrap min-h-[4rem] max-h-64 overflow-y-auto">
                      {trialOutput || <span className="opacity-40">▌</span>}
                    </div>
                  </div>
                  {trialState === "done" && trialOutput && (
                    <div className="flex items-center gap-3 pt-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={evaluateTrial} disabled={evaluating}>
                        {evaluating ? "评估中..." : "评估此答案"}
                      </Button>
                      {trialEval && (
                        <span className={`text-xs ${trialEval.score === null ? "text-amber-600" : "text-muted-foreground"}`}>
                          得分: <span className="font-medium">{trialEval.score !== null ? `${(trialEval.score * 100).toFixed(1)}%` : "N/A"}</span>
                          {trialEval.reason && <span className="ml-1">— {trialEval.reason}</span>}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Right: submit + history */}
      <div className="space-y-3">
        {/* Submit button */}
        {canSubmit && (
          <Card>
            <CardContent className="py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  已提交 {phaseSubs.length}/{maxSubs} 次
                  {phaseSubs.length >= maxSubs && <span className="text-destructive ml-1">（已达上限）</span>}
                </p>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || phaseSubs.length >= maxSubs}
                >
                  {submitting ? "提交中..." : "提交评测"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Progress */}
        {progressSubId && !progressDone && (
          <Card className="border-primary">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent shrink-0" />
                <span className="text-sm font-medium">
                  {progress.total === 0 ? "排队等待中..." :
                    progress.phase === "generating" ? `生成答案中... (${progress.completed + 1}/${progress.total} 题)` :
                    progress.phase === "evaluating" ? `提交评估中... (${progress.completed + 1}/${progress.total} 题)` :
                    progress.phase === "done" ? "评估完成，同步中..." :
                    `评测中... ${progress.completed}/${progress.total} 题`}
                </span>
              </div>
              {progress.currentQuestion && progress.phase === "generating" && (
                <p className="text-xs text-muted-foreground truncate mb-2">▸ {progress.currentQuestion}</p>
              )}
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all"
                  style={{ width: progress.total > 0 ? `${(progress.completed / progress.total) * 100}%` : "0%" }} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submission history */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">提交记录</CardTitle>
            <CardDescription className="text-xs">从所有提交中选一份作为「最终提交」参与排名</CardDescription>
          </CardHeader>
          <CardContent className="pb-3 space-y-4">
            {submissions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">暂无提交记录</p>
            ) : (
              ["PRELIMINARY", "FINALS"].map((ph) => {
                const phaseSubs = submissions.filter((s) => s.phase === ph);
                if (phaseSubs.length === 0) return null;
                return (
                  <div key={ph}>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">
                      {ph === "PRELIMINARY" ? "海选" : "终赛"}
                    </p>
                    <div className="space-y-2">
                      {phaseSubs.map((sub) => {
                        const st = STATUS_BADGE[sub.status];
                        return (
                          <div key={sub.id} className={`border rounded p-2 text-sm ${sub.isFinal ? "border-primary bg-primary/5" : ""}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-medium">v{sub.version}</span>
                                {sub.isFinal && <Badge className="text-[10px] px-1 py-0">最终</Badge>}
                                {sub.status === "SYSERR" ? (
                                  <SysErrTooltip subId={sub.id} authFetch={authFetch} errorMessage={sub.errorMessage} />
                                ) : (
                                  <Badge variant={st?.variant} className="text-[10px]">{st?.label}</Badge>
                                )}
                              </div>
                              <span className="font-mono text-xs">
                                {sub.publicScore !== null ? `${(sub.publicScore * 100).toFixed(1)}%` : "—"}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(sub.createdAt).toLocaleString(locale)}
                            </p>
                            {(sub.status === "COMPLETED" || sub.status === "SYSERR") && (
                              <div className="flex gap-1 mt-1.5">
                                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
                                  onClick={() => viewDetail(sub.id)}>详情</Button>
                                {sub.status === "COMPLETED" && <Button
                                  variant={sub.isFinal ? "default" : "outline"}
                                  size="sm" className="h-6 px-2 text-xs"
                                  onClick={() => toggleFinal(sub.id)}
                                >{sub.isFinal ? "取消最终" : "选为最终"}</Button>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detailSub} onOpenChange={() => setDetailSub(null)}>
        <DialogContent className="w-[90vw] max-w-5xl sm:max-w-5xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>提交详情（仅显示公开题）</DialogTitle>
          </DialogHeader>
          {detailSub?.promptSnapshot !== undefined && (
            <div className="border rounded p-3 bg-muted/50 text-xs space-y-1">
              <p className="font-medium text-muted-foreground">提交时使用的 Prompt / 接入方式</p>
              {detailSub.promptSnapshot ? (
                detailSub.promptSnapshot.startsWith("[Dify]") || detailSub.promptSnapshot.startsWith("[Coze]") ? (
                  <p className="font-mono">{detailSub.promptSnapshot}</p>
                ) : (
                  <pre className="whitespace-pre-wrap font-mono">{detailSub.promptSnapshot}</pre>
                )
              ) : (
                <p className="text-muted-foreground italic">（未设置 Prompt，直接发送题目）</p>
              )}
            </div>
          )}
          <div className="space-y-3">
            {detailSub?.answers
              ?.filter((ans) => ans.question.split === "TRAIN")
              ?.map((ans) => {
                const isGenErr = ans.rawOutput?.startsWith("[调用失败]");
                const genErrMsg = isGenErr ? ans.rawOutput.replace(/^\[调用失败\]\s*/, "") : "";
                const errCategory = isGenErr ? classifyError(genErrMsg) : null;
                const colors = getScoreColors(ans.score);
                return (
                  <div key={ans.id} className={`border border-l-4 rounded p-3 text-sm space-y-2 ${colors.border}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-xs text-muted-foreground flex items-center gap-1.5">
                        Q{ans.question.orderIndex + 1} <span className="ml-1">{colors.icon}</span>
                        {errCategory && (
                          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${errCategory.color}`}>{errCategory.label}</Badge>
                        )}
                      </div>
                      <div className={`px-2 py-0.5 rounded text-xs font-medium ${colors.badge}`}>
                        {ans.score !== null ? `${(ans.score * 100).toFixed(1)}%` : "N/A"}
                      </div>
                    </div>
                    <div className="text-sm font-medium">{ans.question.content}</div>
                    {!isGenErr && ans.rawInput && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                          LLM 输入 ▸
                        </summary>
                        <pre className="mt-1 bg-muted rounded p-2 whitespace-pre-wrap font-mono overflow-x-auto max-h-48 overflow-y-auto">{ans.rawInput}</pre>
                      </details>
                    )}
                    {!isGenErr && ans.rawThinking && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-amber-700 hover:text-amber-900 select-none">
                          🧠 思考过程（Thinking）▸
                        </summary>
                        <pre className="mt-1 bg-amber-50 border border-amber-200 rounded p-2 whitespace-pre-wrap font-mono overflow-x-auto max-h-64 overflow-y-auto text-amber-900">{ans.rawThinking}</pre>
                      </details>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{isGenErr ? "生成错误" : "LLM 输出"}</p>
                      <div className={`rounded p-2 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto ${isGenErr ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
                        {isGenErr
                          ? stripTechnicalDetails(genErrMsg)
                          : (ans.rawOutput || "(无输出)")}
                      </div>
                    </div>
                    {!isGenErr && ans.judgeReason && (
                      <div className={`text-xs ${ans.score === null ? "text-amber-600" : "text-muted-foreground"}`}>
                        {ans.score === null ? "评分器错误: " : "评分理由: "}{ans.judgeReason}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>

      <ConnectivityTestDialog
        open={validateDialog.open}
        status={validateDialog.status}
        message={validateDialog.message}
        onClose={() => { setValidateDialog({ open: false, status: "testing" }); setSubmitting(false); }}
      />
    </div>
    </div>
  );
}

// ────────── 排行榜 Tab ──────────
function LeaderboardTab({
  leaderboard, finalsLeaderboard, taskStatus, isEnded, currentUserId, onRefresh,
}: {
  leaderboard: LeaderboardEntry[];
  finalsLeaderboard: LeaderboardEntry[];
  taskStatus: string;
  isEnded: boolean;
  currentUserId: string;
  onRefresh: () => void;
}) {
  const { locale } = useAuth();
  const showFinals = (taskStatus === "FINALS" || taskStatus === "ENDED") && finalsLeaderboard.length > 0;
  const [phase, setPhase] = useState<"PRELIMINARY" | "FINALS">("PRELIMINARY");
  const [sortBy, setSortBy] = useState<"publicScore" | "privateScore">("publicScore");

  const entries = phase === "FINALS" ? finalsLeaderboard : leaderboard;
  const sorted = [...entries].sort((a, b) => {
    const va = sortBy === "publicScore" ? a.publicScore : (a.privateScore ?? -1);
    const vb = sortBy === "publicScore" ? b.publicScore : (b.privateScore ?? -1);
    return vb - va;
  }).map((e, i) => ({ ...e, displayRank: i + 1 }));

  const SortHead = ({ col, label }: { col: "publicScore" | "privateScore"; label: string }) => (
    <TableHead className="text-right cursor-pointer select-none hover:text-foreground"
      onClick={() => setSortBy(col)}>
      {label} {sortBy === col ? "↓" : ""}
    </TableHead>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            排行榜
            {isEnded ? <Badge variant="secondary">已结束</Badge> : <Badge>进行中</Badge>}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant={phase === "PRELIMINARY" ? "default" : "outline"} size="sm"
              onClick={() => { setPhase("PRELIMINARY"); setSortBy("publicScore"); }}>
              海选
            </Button>
            {showFinals && (
              <Button variant={phase === "FINALS" ? "default" : "outline"} size="sm"
                onClick={() => { setPhase("FINALS"); setSortBy("publicScore"); }}>
                终赛
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onRefresh}>刷新</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          测试集得分{isEnded ? "已公开" : "结束后公开"} &nbsp;·&nbsp; 点击列标题排序
        </p>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">暂无提交记录</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">排名</TableHead>
                <TableHead>姓名</TableHead>
                <SortHead col="publicScore" label="公开集得分" />
                {isEnded && <SortHead col="privateScore" label="测试集得分" />}
                <TableHead className="text-right">提交次数</TableHead>
                <TableHead className="text-right">提交时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((e) => (
                <TableRow key={e.userId} className={e.userId === currentUserId ? "bg-primary/5" : ""}>
                  <TableCell className="font-mono font-medium">
                    {e.displayRank === 1 ? "🥇" : e.displayRank === 2 ? "🥈" : e.displayRank === 3 ? "🥉" : `#${e.displayRank}`}
                  </TableCell>
                  <TableCell>
                    {e.name}
                    {e.userId === currentUserId && <span className="ml-1 text-xs text-muted-foreground">(我)</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {`${(e.publicScore * 100).toFixed(1)}%`}
                  </TableCell>
                  {isEnded && (
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {e.privateScore !== null ? `${(e.privateScore * 100).toFixed(1)}%` : "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-right text-muted-foreground">{e.submissionCount}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {new Date(e.submittedAt).toLocaleString(locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ────────── 颁奖 Tab ──────────
function StudentAwardTab({ leaderboard, isEnded }: { leaderboard: LeaderboardEntry[]; isEnded: boolean }) {
  if (!isEnded || leaderboard.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <div className="text-4xl mb-4">🏆</div>
          <p className="text-xl font-semibold text-muted-foreground">活动进行中</p>
          <p className="text-sm text-muted-foreground mt-2">颁奖结果将在活动结束后公布</p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...leaderboard].sort((a, b) => (b.privateScore ?? b.publicScore) - (a.privateScore ?? a.publicScore));
  const ranked = sorted.map((r) => ({
    ...r,
    rank: sorted.filter((o) => (o.privateScore ?? o.publicScore) > (r.privateScore ?? r.publicScore)).length + 1,
  }));
  const winners = ranked.filter((r) => r.rank <= 3);

  const rank1 = winners.filter((w) => w.rank === 1);
  const rank2 = winners.filter((w) => w.rank === 2);
  const rank3 = winners.filter((w) => w.rank === 3);
  // Keep rank1 in center: if two rank2s flank a single rank1, insert rank1 between them.
  // If multiple rank1s, show them first (all gold) then rank3.
  let podiumOrder: typeof winners;
  if (rank1.length >= 3) {
    podiumOrder = rank1.slice(0, 3);
  } else if (rank1.length === 2) {
    podiumOrder = [...rank1, ...rank3.slice(0, 1)];
  } else if (rank2.length >= 2) {
    podiumOrder = [rank2[0], rank1[0], rank2[1]];
  } else {
    podiumOrder = [...rank2, ...rank1, ...rank3]; // standard: [2nd, 1st, 3rd]
  }

  const medalInfo: Record<number, { emoji: string; color: string; height: string; label: string }> = {
    1: { emoji: "🥇", color: "from-yellow-400 to-amber-500", height: "h-36", label: "冠军" },
    2: { emoji: "🥈", color: "from-slate-300 to-slate-400", height: "h-24", label: "亚军" },
    3: { emoji: "🥉", color: "from-amber-600 to-amber-700", height: "h-16", label: "季军" },
  };

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-b from-primary/10 to-background px-6 pt-10 pb-6">
        <h2 className="text-2xl font-bold text-center mb-2">🎊 最终颁奖典礼 🎊</h2>
        <p className="text-center text-muted-foreground text-sm mb-10">终赛最终排名</p>

        <div className="flex items-end justify-center gap-3 mb-8">
          {podiumOrder.map((w) => {
            const info = medalInfo[w.rank];
            if (!info) return null;
            return (
              <div key={w.userId} className="flex flex-col items-center gap-2 flex-1 max-w-[160px]">
                <div className="text-3xl">{info.emoji}</div>
                <p className="font-bold text-center text-sm leading-tight">{w.name}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {w.privateScore != null ? `${(w.privateScore * 100).toFixed(1)}%` : `${(w.publicScore * 100).toFixed(1)}%`}
                </p>
                <div className={`w-full ${info.height} rounded-t-lg bg-gradient-to-t ${info.color} flex items-center justify-center`}>
                  <span className="text-white font-bold text-xl">{info.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-background rounded-xl p-4 space-y-2">
          {winners.map((w) => (
            <div key={w.userId} className="flex items-center gap-3 py-1">
              <span className="text-lg w-8">{medalInfo[w.rank]?.emoji}</span>
              <span className="font-medium flex-1">{w.name}</span>
              <span className="font-mono text-sm text-muted-foreground">
                {w.privateScore != null ? `${(w.privateScore * 100).toFixed(1)}%` : `${(w.publicScore * 100).toFixed(1)}%`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
