"use client";
import { use, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { toast } from "sonner";
import { SysErrTooltip, classifyError, stripTechnicalDetails } from "@/components/SysErrTooltip";
import { getScoreColors } from "@/lib/scoreColors";

interface LLMConfig {
  id: string;
  name: string;
  models: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  maxPrelimSubs: number;
  maxFinalSubs: number;
  topNForFinals: number;
  maxTrialRuns: number;
  questions: Question[];
  judgeProfile: { id: string; name: string } | null;
  judgeProfileId: string | null;
  adminLLMEnabled: boolean;
  adminStudentLLMConfigId: string | null;
  adminStudentLLMConfig: LLMConfig | null;
  adminModel: string | null;
  adminPrompt: string | null;
  adminEnableThinking: boolean;
  adminThinkingBudget: number | null;
  adminTemperature: number | null;
  subscribeCode: string | null;
  subscribeCodeEnabled: boolean;
  _count: { enrollments: number; submissions: number };
}

interface Question {
  id: string;
  content: string;
  answer: string | null;
  split: "TRAIN" | "TEST" | "UNUSED";
  orderIndex: number;
  _count: { answers: number };
}

interface Enrollment {
  id: string;
  mode: string;
  isFinalist: boolean;
  user: { id: string; name: string; email: string };
  _count: { submissions: number };
}

interface Submission {
  id: string;
  phase: string;
  status: string;
  errorMessage: string | null;
  publicScore: number | null;
  finalScore: number | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

interface JudgeProfile {
  id: string;
  name: string;
  type: string;
}

interface AnswerDetail {
  id: string;
  rawInput: string | null;
  rawThinking: string | null;
  rawOutput: string;
  score: number | null;
  judgeReason: string | null;
  question: { content: string; split: "TRAIN" | "TEST" | "UNUSED"; orderIndex: number };
}

interface SubmissionDetail {
  id: string;
  promptSnapshot: string | null;
  user: { name: string };
  answers: AnswerDetail[];
}

const STAGES = [
  { key: "DRAFT", label: "草稿", short: "草稿" },
  { key: "PRELIMINARY", label: "海选阶段", short: "海选" },
  { key: "FINALS", label: "终赛阶段", short: "终赛" },
  { key: "ENDED", label: "已结束", short: "结束" },
];

const NEXT_STATUS: Record<string, string | null> = {
  DRAFT: "PRELIMINARY",
  PRELIMINARY: "FINALS",
  FINALS: "ENDED",
  ENDED: null,
};

const NEXT_LABEL: Record<string, string> = {
  DRAFT: "开启海选",
  PRELIMINARY: "进入终赛",
  FINALS: "结束比赛",
};

const MODE_LABELS: Record<string, string> = {
  ADMIN_LLM: "管理员指定",
  OPENAI_COMPATIBLE: "OpenAI API",
  DIFY: "Dify",
  COZE: "Coze",
};

export default function AdminTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading, authFetch, locale } = useAuth();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [judgeProfiles, setJudgeProfiles] = useState<JudgeProfile[]>([]);
  const [llmConfigs, setLlmConfigs] = useState<LLMConfig[]>([]);
  const [bulkText, setBulkText] = useState("");
  const [newQ, setNewQ] = useState({ content: "", answer: "", split: "UNUSED" as "TRAIN" | "TEST" | "UNUSED" });
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitConfig, setSplitConfig] = useState({ trainCount: 0, testCount: 0 });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saveToBankOpen, setSaveToBankOpen] = useState(false);
  const [availableBanks, setAvailableBanks] = useState<{ id: string; name: string; isSample: boolean; _count: { items: number } }[]>([]);
  const [saveBankId, setSaveBankId] = useState("");
  const [newBankName, setNewBankName] = useState("");
  const [savingToBank, setSavingToBank] = useState(false);
  const [bankImportId, setBankImportId] = useState("");
  const [bankImportItems, setBankImportItems] = useState<{ id: string; content: string; answer: string | null }[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [loadingBankItems, setLoadingBankItems] = useState(false);
  const [resetConfirm, setResetConfirm] = useState<"DRAFT" | "PRELIMINARY" | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailSub, setDetailSub] = useState<SubmissionDetail | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Edit form state
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    judgeProfileId: "",
    maxPrelimSubs: 3,
    maxFinalSubs: 3,
    topNForFinals: 10,
    maxTrialRuns: 15,
    adminLLMEnabled: false,
    adminStudentLLMConfigId: "",
    adminModel: "",
    adminPrompt: "",
    adminEnableThinking: false,
    adminThinkingBudget: "",
    adminTemperature: "",
    adminMaxTokens: "",
  });

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (user.role !== "ADMIN" && !user.canPublish) router.replace("/not-found");
    }
  }, [user, loading, router]);

  const loadTask = useCallback(() =>
    authFetch(`/api/admin/tasks/${id}`).then((r) => r.json()).then((d) => {
      if (d.task) {
        setTask(d.task);
        setEditForm({
          title: d.task.title,
          description: d.task.description,
          judgeProfileId: d.task.judgeProfileId ?? "",
          maxPrelimSubs: d.task.maxPrelimSubs,
          maxFinalSubs: d.task.maxFinalSubs,
          topNForFinals: d.task.topNForFinals,
          maxTrialRuns: d.task.maxTrialRuns ?? 10,
          adminLLMEnabled: d.task.adminLLMEnabled ?? false,
          adminStudentLLMConfigId: d.task.adminStudentLLMConfigId ?? "",
          adminModel: d.task.adminModel ?? "",
          adminPrompt: d.task.adminPrompt ?? "",
          adminEnableThinking: d.task.adminEnableThinking ?? false,
          adminThinkingBudget: d.task.adminThinkingBudget != null ? String(d.task.adminThinkingBudget) : "",
          adminTemperature: d.task.adminTemperature != null ? String(d.task.adminTemperature) : "",
          adminMaxTokens: d.task.adminMaxTokens != null ? String(d.task.adminMaxTokens) : "",
        });
      }
    }), [authFetch, id]);

  const loadEnrollments = useCallback(() =>
    authFetch(`/api/admin/tasks/${id}/enrollments`).then((r) => r.json()).then((d) => setEnrollments(d.enrollments || [])),
    [authFetch, id]);

  const loadSubmissions = useCallback(() =>
    authFetch(`/api/admin/tasks/${id}/submissions`).then((r) => r.json()).then((d) => setSubmissions(d.submissions || [])),
    [authFetch, id]);

  useEffect(() => {
    if (!user) return;
    loadTask();
    loadEnrollments();
    loadSubmissions();
    authFetch("/api/admin/judge-profiles").then((r) => r.json()).then((d) => setJudgeProfiles(d.profiles || []));
    authFetch("/api/student/llm-config").then((r) => r.json()).then((d) => setLlmConfigs(d.configs || []));
  }, [user, id]); // eslint-disable-line

  const changeStatus = async (status: string) => {
    const res = await authFetch(`/api/admin/tasks/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error);
    setTask((t) => t ? { ...t, status } : t);
    toast.success(`已切换至「${STAGES.find((s) => s.key === status)?.label}」`);
  };

  const saveTaskInfo = async () => {
    setSaving(true);
    try {
      const res = await authFetch(`/api/admin/tasks/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...editForm,
          judgeProfileId: editForm.judgeProfileId || null,
          adminStudentLLMConfigId: editForm.adminStudentLLMConfigId || null,
          adminModel: editForm.adminModel || null,
          adminPrompt: editForm.adminPrompt || null,
          adminThinkingBudget: editForm.adminThinkingBudget ? Number(editForm.adminThinkingBudget) : null,
          adminTemperature: editForm.adminTemperature ? Number(editForm.adminTemperature) : null,
          adminMaxTokens: editForm.adminMaxTokens ? Number(editForm.adminMaxTokens) : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      loadTask();
      toast.success("已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const addQuestion = async () => {
    if (!newQ.content) return toast.error("题目不能为空");
    setSaving(true);
    try {
      const res = await authFetch(`/api/admin/tasks/${id}/questions`, {
        method: "POST", body: JSON.stringify(newQ),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setAddOpen(false); setNewQ({ content: "", answer: "", split: "UNUSED" });
      loadTask();
      toast.success("已添加");
    } catch (e) { toast.error(e instanceof Error ? e.message : "失败"); }
    finally { setSaving(false); }
  };

  const bulkImport = async (payload: { text?: string; csv?: string }) => {
    setSaving(true);
    try {
      const res = await authFetch(`/api/admin/tasks/${id}/questions/bulk`, {
        method: "POST", body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBulkOpen(false); setBulkText("");
      loadTask();
      toast.success(`已导入 ${data.count} 道题目`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "失败"); }
    finally { setSaving(false); }
  };

  const downloadTemplate = async () => {
    const res = await authFetch(`/api/admin/tasks/${id}/questions/template`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "questions_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = async () => {
    const res = await authFetch(`/api/admin/tasks/${id}/questions/export`);
    if (!res.ok) return toast.error("导出失败");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `questions_${task?.title ?? id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const loadAvailableBanks = async () => {
    const res = await authFetch("/api/user/question-banks");
    const data = await res.json();
    const all = [...(data.personalBanks || [])];
    setAvailableBanks(all);
  };

  const loadBankItems = async (bid: string) => {
    setLoadingBankItems(true);
    setSelectedItemIds(new Set());
    setBankImportItems([]);
    try {
      const res = await authFetch(`/api/user/question-banks/${bid}`);
      const data = await res.json();
      setBankImportItems(data.bank?.items || []);
    } finally {
      setLoadingBankItems(false);
    }
  };

  const importFromBank = async () => {
    if (!bankImportId) return toast.error("请选择题库");
    if (selectedItemIds.size === 0) return toast.error("请至少选择一道题目");

    // Duplicate detection: compare selected items' content against existing questions
    const existingContents = new Set((task?.questions ?? []).map((q) => q.content.trim()));
    const selectedItems = bankImportItems.filter((it) => selectedItemIds.has(it.id));
    const duplicates = selectedItems.filter((it) => existingContents.has(it.content.trim()));
    let itemIdsToImport = Array.from(selectedItemIds);
    if (duplicates.length > 0) {
      const skip = !confirm(
        `选中的题目中有 ${duplicates.length} 道题干与活动现有题目完全相同：\n` +
        duplicates.slice(0, 3).map((d) => `· ${d.content.slice(0, 40)}${d.content.length > 40 ? "…" : ""}`).join("\n") +
        (duplicates.length > 3 ? `\n· …（共 ${duplicates.length} 道）` : "") +
        `\n\n点击「确定」仍然导入重复题目；点击「取消」跳过重复，仅导入不重复的 ${selectedItems.length - duplicates.length} 道。`
      );
      if (skip) {
        const dupIds = new Set(duplicates.map((d) => d.id));
        itemIdsToImport = itemIdsToImport.filter((id) => !dupIds.has(id));
        if (itemIdsToImport.length === 0) { toast.info("所有选中题目均为重复，已取消导入"); return; }
      }
    }

    setSaving(true);
    try {
      const res = await authFetch(`/api/admin/tasks/${id}/questions/bulk`, {
        method: "POST",
        body: JSON.stringify({ bankId: bankImportId, itemIds: itemIdsToImport }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBulkOpen(false);
      setBankImportId("");
      setBankImportItems([]);
      setSelectedItemIds(new Set());
      loadTask();
      toast.success(`已导入 ${data.count} 道题目`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    } finally {
      setSaving(false);
    }
  };

  const saveToBank = async () => {
    if (!saveBankId && !newBankName.trim()) return toast.error("请选择题库或填写新题库名称");
    setSavingToBank(true);
    try {
      const res = await authFetch(`/api/admin/tasks/${id}/questions/save-to-bank`, {
        method: "POST",
        body: JSON.stringify(saveBankId ? { bankId: saveBankId } : { bankName: newBankName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaveToBankOpen(false);
      setSaveBankId("");
      setNewBankName("");
      toast.success(`已保存 ${data.count} 道题目到题库`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "失败");
    } finally {
      setSavingToBank(false);
    }
  };

  const handleCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const csv = ev.target?.result as string;
      bulkImport({ csv });
    };
    reader.readAsText(file, "utf-8");
  };

  const randomizeSplit = async () => {
    const res = await authFetch(`/api/admin/tasks/${id}/questions/randomize-split`, {
      method: "POST",
      body: JSON.stringify({ trainCount: splitConfig.trainCount, testCount: splitConfig.testCount }),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error);
    loadTask();
    toast.success(`已根据比例随机划分：训练 ${data.trainCount} · 测试 ${data.testCount} · 不使用 ${data.unusedCount}`);
  };

  const bulkDeleteQuestions = async (mode: "unused" | "noAnswers" | "all") => {
    const qs = task!.questions;
    const preview = mode === "unused"
      ? qs.filter((q) => q.split === "UNUSED")
      : mode === "noAnswers"
        ? qs.filter((q) => q._count.answers === 0)
        : qs;
    const labels: Record<string, string> = {
      unused: `分组为「不使用」的 ${preview.length} 道题目`,
      noAnswers: `尚未收到任何作答的 ${preview.length} 道题目`,
      all: `全部 ${preview.length} 道题目`,
    };
    if (preview.length === 0) { toast.info("没有符合条件的题目"); return; }
    if (!confirm(`确定要删除${labels[mode]}吗？\n\n这将同时删除这些题目的所有作答记录，且不可撤销。`)) return;
    const res = await authFetch(`/api/admin/tasks/${task!.id}/questions/bulk`, {
      method: "DELETE",
      body: JSON.stringify({ mode }),
    });
    if (!res.ok) { toast.error((await res.json()).error || "删除失败"); return; }
    const { count: deleted } = await res.json();
    toast.success(`已删除 ${deleted} 道题目`);
    loadTask();
  };

  const deleteQuestion = async (qid: string) => {
    const res = await authFetch(`/api/admin/questions/${qid}`, { method: "DELETE" });
    if (!res.ok) { toast.error((await res.json()).error || "删除失败"); return; }
    loadTask();
  };

  const SPLIT_CYCLE: Record<string, "TRAIN" | "TEST" | "UNUSED"> = { UNUSED: "TRAIN", TRAIN: "TEST", TEST: "UNUSED" };
  const toggleSplit = async (q: Question) => {
    const next = SPLIT_CYCLE[q.split] ?? "TRAIN";
    await authFetch(`/api/admin/questions/${q.id}`, {
      method: "PUT",
      body: JSON.stringify({ split: next }),
    });
    loadTask();
  };

  const toggleFinalist = async (eid: string, cur: boolean) => {
    await authFetch(`/api/admin/enrollments/${eid}/finalist`, {
      method: "PATCH", body: JSON.stringify({ isFinalist: !cur }),
    });
    loadEnrollments();
  };

  const autoSelectFinalists = async () => {
    if (!task) return;
    const res = await authFetch(`/api/admin/tasks/${id}/select-finalists`, {
      method: "POST", body: JSON.stringify({ topN: task.topNForFinals }),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error);
    loadEnrollments();
    toast.success(`已选 ${data.selected} 名晋级选手`);
  };

  const deletePhaseSubmissions = async (phase: "PRELIMINARY" | "FINALS") => {
    const label = phase === "FINALS" ? "终赛" : "海选";
    if (!confirm(`确定要删除所有「${label}」阶段的提交记录吗？此操作不可撤销。`)) return;
    const res = await authFetch(`/api/admin/tasks/${id}/submissions?phase=${phase}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error);
    loadSubmissions();
    toast.success(`已删除 ${data.deleted} 条${label}提交`);
  };

  const retrySubmission = async (subId: string) => {
    const res = await authFetch(`/api/admin/submissions/${subId}/retry`, { method: "POST" });
    if (!res.ok) return toast.error((await res.json()).error);
    loadSubmissions();
    toast.success("已重新加入队列");
  };

  const deleteSubmission = async (subId: string) => {
    if (!confirm("确定要删除这条提交记录吗？此操作不可撤销。")) return;
    const res = await authFetch(`/api/admin/submissions/${subId}`, { method: "DELETE" });
    if (!res.ok) return toast.error((await res.json()).error);
    loadSubmissions();
    toast.success("已删除");
  };

  const viewSubmissionDetail = async (subId: string) => {
    const res = await authFetch(`/api/submissions/${subId}`);
    const data = await res.json();
    setDetailSub(data.submission);
  };

  if (loading || !task) return (
    <div>
      <Navbar backHref="/dashboard" backLabel="活动广场" />
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    </div>
  );

  const currentStageIdx = STAGES.findIndex((s) => s.key === task.status);
  const nextStatus = NEXT_STATUS[task.status];

  return (
    <div>
      <Navbar
        backHref="/dashboard"
        backLabel="活动广场"
        breadcrumbs={[{ label: task.title }]}
      />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{task.title}</h1>
          {task.description && <p className="text-muted-foreground mt-1">{task.description}</p>}
          {task.subscribeCode && task.status !== "DRAFT" && (
            <div className="flex items-center gap-2 mt-2">
              <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1 ${task.subscribeCodeEnabled ? "border-primary/30 bg-primary/5" : "border-border bg-muted/40"}`}>
                <span className="text-xs text-muted-foreground">订阅码</span>
                <span className={`font-mono text-base font-bold tracking-widest ${task.subscribeCodeEnabled ? "text-primary" : "text-muted-foreground line-through"}`}>
                  {task.subscribeCode}
                </span>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    const code = task.subscribeCode!;
                    if (navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(code).then(() => toast.success("已复制"));
                    } else {
                      const el = document.createElement("textarea");
                      el.value = code;
                      el.style.position = "fixed";
                      el.style.opacity = "0";
                      document.body.appendChild(el);
                      el.select();
                      document.execCommand("copy");
                      document.body.removeChild(el);
                      toast.success("已复制");
                    }
                  }}
                >复制</button>
                <span className="text-border">·</span>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={async () => {
                    const res = await authFetch(`/api/tasks/${id}/subscribe-code`, { method: "PATCH", body: JSON.stringify({ enabled: !task.subscribeCodeEnabled }) });
                    if (res.ok) { toast.success(task.subscribeCodeEnabled ? "已停用" : "已启用"); loadTask(); }
                  }}
                >{task.subscribeCodeEnabled ? "停用" : "启用"}</button>
                <span className="text-border">·</span>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={async () => {
                    if (!confirm("重新生成后旧订阅码失效，已订阅的用户不受影响。确定？")) return;
                    const res = await authFetch(`/api/tasks/${id}/subscribe-code`, { method: "POST" });
                    if (res.ok) { toast.success("已重新生成"); loadTask(); }
                  }}
                >重新生成</button>
              </div>
            </div>
          )}
        </div>

        {/* Status stepper */}
        <Card className="mb-6">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-0">
              {STAGES.map((stage, i) => {
                const isCurrent = i === currentStageIdx;
                const isPast = i < currentStageIdx;
                const isFuture = i > currentStageIdx;
                return (
                  <div key={stage.key} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors
                        ${isCurrent ? "border-primary bg-primary text-primary-foreground" : ""}
                        ${isPast ? "border-primary/40 bg-primary/10 text-primary" : ""}
                        ${isFuture ? "border-muted-foreground/30 text-muted-foreground/50" : ""}
                      `}>
                        {isPast ? "✓" : i + 1}
                      </div>
                      <span className={`text-xs font-medium ${isCurrent ? "text-primary" : isPast ? "text-primary/70" : "text-muted-foreground/50"}`}>
                        {stage.short}
                      </span>
                    </div>
                    {i < STAGES.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 ${i < currentStageIdx ? "bg-primary/40" : "bg-muted-foreground/20"}`} />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-4">
              <div className="flex gap-2 flex-wrap">
                {nextStatus && (
                  <Button size="sm" onClick={() => changeStatus(nextStatus)}>
                    {NEXT_LABEL[task.status]} →
                  </Button>
                )}
                {task.status === "FINALS" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/40"
                    onClick={() => setResetConfirm("PRELIMINARY")}
                  >
                    重置到海选
                  </Button>
                )}
                {task.status !== "DRAFT" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/40"
                    onClick={() => setResetConfirm("DRAFT")}
                  >
                    重置到草稿
                  </Button>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {task._count.enrollments} 人报名 · {task._count.submissions} 次提交
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="questions">
          <div className="flex items-center gap-2 mb-4">
            <TabsList>
              <TabsTrigger value="questions">题目 ({task.questions.length})</TabsTrigger>
              <TabsTrigger value="enrollments">报名 ({enrollments.length})</TabsTrigger>
              <TabsTrigger value="submissions">提交 ({submissions.length})</TabsTrigger>
              <TabsTrigger value="leaderboard">排行榜</TabsTrigger>
              <TabsTrigger value="award">颁奖</TabsTrigger>
              <TabsTrigger value="settings">设置</TabsTrigger>
            </TabsList>
            <Button
              variant="outline" size="sm"
              onClick={() => { loadTask(); loadEnrollments(); loadSubmissions(); setRefreshKey((k) => k + 1); }}
            >↻ 刷新</Button>
          </div>

          {/* Questions Tab */}
          <TabsContent value="questions">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="min-w-0">
                    <CardTitle>题目管理</CardTitle>
                    {task.questions.length > 0 && (() => {
                      const counts = task.questions.reduce(
                        (acc, q) => { acc[q.split]++; return acc; },
                        { TRAIN: 0, TEST: 0, UNUSED: 0 }
                      );
                      return (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          训练集 {counts.TRAIN} · 测试集 {counts.TEST} · 不使用 {counts.UNUSED}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <div className="flex gap-2 flex-wrap justify-end">
                      <Button variant="outline" size="sm" onClick={() => {
                        const total = task.questions.length;
                        const counts = task.questions.reduce(
                          (acc, q) => { acc[q.split]++; return acc; },
                          { TRAIN: 0, TEST: 0, UNUSED: 0 }
                        );
                        setSplitConfig({
                          trainCount: counts.TRAIN || Math.floor(total * 0.7),
                          testCount: counts.TEST || Math.floor(total * 0.3),
                        });
                        setSplitDialogOpen(true);
                      }}>
                        设置分组
                      </Button>
                      <Button variant="outline" size="sm" onClick={randomizeSplit}>
                        根据比例随机划分
                      </Button>
                      {task.questions.length > 0 && (
                        <Button variant="outline" size="sm" onClick={() => { loadAvailableBanks(); setSaveBankId(""); setNewBankName(""); setSaveToBankOpen(true); }}>
                          导出
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => { setBankImportId(""); setBankImportItems([]); setSelectedItemIds(new Set()); loadAvailableBanks(); setBulkOpen(true); }}>
                        导入
                      </Button>
                      <Button size="sm" onClick={() => { setNewQ({ content: "", answer: "", split: "UNUSED" }); setAddOpen(true); }}>
                        + 添加题目
                      </Button>
                    </div>
                    {task.questions.length > 0 && (
                      <div className="flex gap-2 flex-wrap justify-end">
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive border-destructive/40 hover:border-destructive text-xs h-7"
                          title="删除所有分组为「不使用」的题目及其作答记录"
                          onClick={() => bulkDeleteQuestions("unused")}>
                          清空「不使用」题目
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive border-destructive/40 hover:border-destructive text-xs h-7"
                          title="删除所有尚未收到任何参赛者作答的题目"
                          onClick={() => bulkDeleteQuestions("noAnswers")}>
                          清空作答数为 0 的题目
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive border-destructive/40 hover:border-destructive text-xs h-7"
                          title="删除该活动下的全部题目及其作答记录"
                          onClick={() => bulkDeleteQuestions("all")}>
                          清空所有题目
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {task.questions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">暂无题目，点击「+ 添加题目」或「导入」</p>
                ) : (
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>题目</TableHead>
                        <TableHead className="w-[30%]">参考答案</TableHead>
                        <TableHead className="w-20">分组</TableHead>
                        <TableHead className="w-20 text-center">收到的作答数</TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {task.questions.map((q, i) => (
                        <TableRow key={q.id}>
                          <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                          <TableCell>
                            <p className="truncate">{q.content}</p>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            <div className="truncate">{q.answer || "—"}</div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={q.split === "TRAIN" ? "outline" : "secondary"}
                              className={`text-xs cursor-pointer hover:opacity-70 ${q.split === "TRAIN" ? "text-green-600 border-green-300" : q.split === "TEST" ? "text-amber-600" : "text-muted-foreground"}`}
                              onClick={() => toggleSplit(q)}
                              title="点击切换分组"
                            >
                              {q.split === "TRAIN" ? "训练" : q.split === "TEST" ? "测试" : "不使用"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {q._count.answers > 0 ? (
                              <span className="text-xs font-medium text-blue-600" title={`该题目共有 ${q._count.answers} 条作答记录`}>
                                {q._count.answers}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="text-destructive h-7 px-2"
                              onClick={() => deleteQuestion(q.id)}>删除</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Enrollments Tab */}
          <TabsContent value="enrollments">
            <Card>
              <CardHeader>
                <CardTitle>报名管理</CardTitle>
              </CardHeader>
              <CardContent>
                {enrollments.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">暂无报名</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>姓名</TableHead>
                        <TableHead>邮箱</TableHead>
                        <TableHead>接入方式</TableHead>
                        <TableHead className="text-right">提交次数</TableHead>
                        <TableHead className="text-right">终赛资格</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enrollments.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-medium">{e.user.name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{e.user.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{MODE_LABELS[e.mode] || e.mode}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{e._count.submissions}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant={e.isFinalist ? "default" : "outline"}
                              size="sm"
                              onClick={() => toggleFinalist(e.id, e.isFinalist)}
                            >
                              {e.isFinalist ? "✓ 已晋级" : "设为晋级"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Submissions Tab */}
          <TabsContent value="submissions">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>提交记录</CardTitle>
                  <div className="flex gap-2">
                    {(task.status === "PRELIMINARY" || task.status === "ENDED") && (
                      <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:bg-destructive/10"
                        onClick={() => deletePhaseSubmissions("PRELIMINARY")}>删除海选提交</Button>
                    )}
                    {(task.status === "FINALS" || task.status === "ENDED") && (
                      <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:bg-destructive/10"
                        onClick={() => deletePhaseSubmissions("FINALS")}>删除终赛提交</Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {submissions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">暂无提交</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>姓名</TableHead>
                        <TableHead>阶段</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="text-right">公开得分</TableHead>
                        <TableHead className="text-right">最终得分</TableHead>
                        <TableHead className="text-right">时间</TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {submissions.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.user.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{s.phase === "FINALS" ? "终赛" : "海选"}</Badge>
                          </TableCell>
                          <TableCell>
                            {s.status === "SYSERR" ? (
                              <SysErrTooltip subId={s.id} authFetch={authFetch} errorMessage={s.errorMessage} />
                            ) : (
                              <Badge variant={s.status === "FAILED" ? "destructive" : s.status === "COMPLETED" ? "secondary" : "outline"}>
                                {s.status === "COMPLETED" ? "完成" : s.status === "FAILED" ? "失败" : s.status === "RUNNING" ? "运行中" : "等待"}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {s.publicScore != null ? `${(s.publicScore * 100).toFixed(1)}%` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {s.finalScore != null ? `${(s.finalScore * 100).toFixed(1)}%` : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {new Date(s.createdAt).toLocaleString(locale)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => viewSubmissionDetail(s.id)}>详情</Button>
                              {(s.status === "FAILED" || s.status === "SYSERR") && (
                                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => retrySubmission(s.id)}>重跑</Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => deleteSubmission(s.id)}>删除</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leaderboard Tab */}
          <TabsContent value="leaderboard">
            <LeaderboardTab taskId={id} task={task} onSelectFinalists={autoSelectFinalists} authFetch={authFetch} refreshKey={refreshKey} />
          </TabsContent>

          {/* Award Tab */}
          <TabsContent value="award">
            <AwardTab taskId={id} taskStatus={task.status} authFetch={authFetch} refreshKey={refreshKey} />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader><CardTitle>任务设置</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>任务名称</Label>
                  <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>任务描述</Label>
                  <Textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>评分器</Label>
                  <Select
                    value={editForm.judgeProfileId}
                    onValueChange={(v) => setEditForm({ ...editForm, judgeProfileId: v ?? "" })}
                  >
                    <SelectTrigger>
                      <span className={`flex-1 text-left text-sm ${!editForm.judgeProfileId ? "text-muted-foreground" : ""}`}>
                        {judgeProfiles.find((p) => p.id === editForm.judgeProfileId)?.name || "不使用评分器"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">不使用评分器</SelectItem>
                      {judgeProfiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.type === "OBJECTIVE" ? "客观题" : "主观题"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>海选最大提交次数</Label>
                    <Input
                      type="number" min={1}
                      value={editForm.maxPrelimSubs}
                      onChange={(e) => setEditForm({ ...editForm, maxPrelimSubs: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>终赛最大提交次数</Label>
                    <Input
                      type="number" min={1}
                      value={editForm.maxFinalSubs}
                      onChange={(e) => setEditForm({ ...editForm, maxFinalSubs: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>晋级终赛人数 (Top N)</Label>
                    <Input
                      type="number" min={1}
                      value={editForm.topNForFinals}
                      onChange={(e) => setEditForm({ ...editForm, topNForFinals: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>试跑次数上限</Label>
                    <Input
                      type="number" min={0}
                      value={editForm.maxTrialRuns}
                      onChange={(e) => setEditForm({ ...editForm, maxTrialRuns: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="border-t pt-4 mt-2">
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="checkbox"
                      id="adminLLMEnabled"
                      checked={editForm.adminLLMEnabled}
                      onChange={(e) => setEditForm(e.target.checked
                        ? { ...editForm, adminLLMEnabled: true }
                        : {
                            ...editForm,
                            adminLLMEnabled: false,
                            adminStudentLLMConfigId: "",
                            adminModel: "",
                            adminPrompt: "",
                            adminEnableThinking: false,
                            adminThinkingBudget: "",
                            adminTemperature: "",
                            adminMaxTokens: "",
                          })}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="adminLLMEnabled" className="cursor-pointer font-medium">
                      启用「管理员指定」接入方式
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    开启后，参赛者统一使用下方 LLM 接入，但仍可自行填写系统提示词。
                  </p>
                  {editForm.adminLLMEnabled && (
                    <div className="space-y-3 pl-2 border-l-2 border-muted">
                      <div className="space-y-1.5">
                        <Label>LLM 提供商 *</Label>
                        <Select
                          value={editForm.adminStudentLLMConfigId}
                          onValueChange={(v) => {
                            const cfg = llmConfigs.find((c) => c.id === v);
                            setEditForm({ ...editForm, adminStudentLLMConfigId: v ?? "", adminModel: cfg?.models.split(",")[0]?.trim() ?? "" });
                          }}
                        >
                          <SelectTrigger>
                            <span className={`flex-1 text-left text-sm ${!editForm.adminStudentLLMConfigId ? "text-muted-foreground" : ""}`}>
                              {llmConfigs.find((c) => c.id === editForm.adminStudentLLMConfigId)?.name || "选择 LLM 配置"}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {llmConfigs.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>模型 *</Label>
                        {editForm.adminStudentLLMConfigId && llmConfigs.find((c) => c.id === editForm.adminStudentLLMConfigId)?.models ? (
                          <Select
                            value={editForm.adminModel}
                            onValueChange={(v) => setEditForm({ ...editForm, adminModel: v ?? "" })}
                          >
                            <SelectTrigger>
                              <span className={`flex-1 text-left text-sm ${!editForm.adminModel ? "text-muted-foreground" : ""}`}>
                                {editForm.adminModel || "选择模型"}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {(llmConfigs.find((c) => c.id === editForm.adminStudentLLMConfigId)?.models || "")
                                .split(",").map((m) => m.trim()).filter(Boolean).map((m) => (
                                  <SelectItem key={m} value={m}>{m}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={editForm.adminModel}
                            onChange={(e) => setEditForm({ ...editForm, adminModel: e.target.value })}
                            placeholder="输入模型名称"
                          />
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label>Temperature</Label>
                          <Input
                            type="number" min={0} max={2} step={0.1}
                            value={editForm.adminTemperature}
                            onChange={(e) => setEditForm({ ...editForm, adminTemperature: e.target.value })}
                            placeholder="默认"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Max Tokens</Label>
                          <Input
                            type="number" min={256} step={256}
                            value={editForm.adminMaxTokens}
                            onChange={(e) => setEditForm({ ...editForm, adminMaxTokens: e.target.value })}
                            placeholder="默认 2048"
                          />
                        </div>
                        <div className="flex items-end pb-1 gap-2">
                          <input
                            type="checkbox"
                            id="adminEnableThinking"
                            checked={editForm.adminEnableThinking}
                            onChange={(e) => setEditForm({ ...editForm, adminEnableThinking: e.target.checked })}
                            className="h-4 w-4 mb-1"
                          />
                          <Label htmlFor="adminEnableThinking" className="cursor-pointer text-xs">
                            深度思考（并非所有模型支持）
                          </Label>
                        </div>
                        {editForm.adminEnableThinking && (
                          <div className="space-y-1.5">
                            <Label>Thinking Budget</Label>
                            <Input
                              type="number" min={256}
                              value={editForm.adminThinkingBudget}
                              onChange={(e) => setEditForm({ ...editForm, adminThinkingBudget: e.target.value })}
                              placeholder="默认 1024"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <Button onClick={saveTaskInfo} disabled={saving}>
                  {saving ? "保存中..." : "保存设置"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
          <DialogContent className="max-w-xl overflow-hidden">
            <DialogHeader><DialogTitle>批量导入题目</DialogTitle></DialogHeader>
            <Tabs defaultValue="bank" className="min-w-0">
              <TabsList className="w-full">
                <TabsTrigger value="bank" className="flex-1">从题库导入</TabsTrigger>
                <TabsTrigger value="csv" className="flex-1">CSV 上传</TabsTrigger>
              </TabsList>

              <TabsContent value="bank" className="min-w-0 space-y-3 pt-2">
                {availableBanks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">暂无可用题库。请先在账户中心创建题库或由管理员创建样例题库。</p>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label>选择题库</Label>
                      <Select value={bankImportId} onValueChange={(v) => { setBankImportId(v ?? ""); if (v) loadBankItems(v); }}>
                        <SelectTrigger className="w-full">
                          <span className={`flex-1 text-left text-sm truncate ${!bankImportId ? "text-muted-foreground" : ""}`}>
                            {availableBanks.find((b) => b.id === bankImportId)?.name || "请选择题库"}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {availableBanks.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}{b.isSample ? " [样例]" : ""} ({b._count.items} 题)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {bankImportId && (
                      <>
                        {loadingBankItems ? (
                          <p className="text-sm text-muted-foreground text-center py-4">加载中...</p>
                        ) : bankImportItems.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">该题库暂无题目。</p>
                        ) : (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">已选 {selectedItemIds.size} / {bankImportItems.length} 题</span>
                              <Button
                                variant="ghost" size="sm" className="text-xs h-7"
                                onClick={() => setSelectedItemIds(
                                  selectedItemIds.size === bankImportItems.length
                                    ? new Set()
                                    : new Set(bankImportItems.map((it) => it.id))
                                )}
                              >
                                {selectedItemIds.size === bankImportItems.length ? "取消全选" : "全选"}
                              </Button>
                            </div>
                            <div className="border rounded-lg divide-y max-h-52 overflow-y-auto overflow-x-hidden">
                              {bankImportItems.map((item) => (
                                <label key={item.id} className="flex min-w-0 items-start gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 shrink-0"
                                    checked={selectedItemIds.has(item.id)}
                                    onChange={(e) => {
                                      const next = new Set(selectedItemIds);
                                      if (e.target.checked) next.add(item.id);
                                      else next.delete(item.id);
                                      setSelectedItemIds(next);
                                    }}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm truncate">{item.content}</p>
                                    {item.answer && <p className="text-xs text-muted-foreground truncate">{item.answer}</p>}
                                  </div>
                                </label>
                              ))}
                            </div>
                            <Button onClick={importFromBank} disabled={saving || selectedItemIds.size === 0} className="w-full">
                              {saving ? "导入中..." : `导入选中的 ${selectedItemIds.size} 道题目`}
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="csv" className="space-y-3 pt-2">
                <p className="text-sm text-muted-foreground">
                  CSV 三列：题目、参考答案（可空）、private（1=隐藏集/0=公开集，可省略）。
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={downloadTemplate}>
                    下载 CSV 模板
                  </Button>
                </div>
                <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <span className="text-sm text-muted-foreground">点击选择 CSV 文件</span>
                  <span className="text-xs text-muted-foreground mt-1">UTF-8 编码</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleCSVFile}
                    disabled={saving}
                  />
                </label>
                {saving && <p className="text-sm text-center text-muted-foreground">导入中...</p>}
              </TabsContent>

            </Tabs>
          </DialogContent>
        </Dialog>

        {/* Split config dialog */}
        <Dialog open={splitDialogOpen} onOpenChange={setSplitDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>设置分组数量</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-1">
              <p className="text-xs text-muted-foreground">
                共 {task?.questions.length ?? 0} 道题目。设置训练集和测试集数量，剩余为「不使用」。
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>训练集</Label>
                  <Input type="number" min={0} max={task?.questions.length ?? 0}
                    value={splitConfig.trainCount}
                    onChange={(e) => {
                      const train = Math.max(0, parseInt(e.target.value) || 0);
                      const maxTest = (task?.questions.length ?? 0) - train;
                      setSplitConfig({ trainCount: train, testCount: Math.min(splitConfig.testCount, maxTest) });
                    }} />
                </div>
                <div className="space-y-1.5">
                  <Label>测试集</Label>
                  <Input type="number" min={0} max={(task?.questions.length ?? 0) - splitConfig.trainCount}
                    value={splitConfig.testCount}
                    onChange={(e) => setSplitConfig({ ...splitConfig, testCount: Math.max(0, parseInt(e.target.value) || 0) })} />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                不使用：{Math.max(0, (task?.questions.length ?? 0) - splitConfig.trainCount - splitConfig.testCount)} 道
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSplitDialogOpen(false)}>取消</Button>
                <Button className="flex-1" onClick={() => { setSplitDialogOpen(false); randomizeSplit(); }}>根据比例随机划分</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>添加题目</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>题目内容 *</Label>
                <Textarea value={newQ.content} onChange={(e) => setNewQ({ ...newQ, content: e.target.value })} rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label>参考答案（可选，用于 LLM 评分器参考）</Label>
                <Input value={newQ.answer} onChange={(e) => setNewQ({ ...newQ, answer: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>分组</Label>
                <div className="flex gap-2">
                  {(["UNUSED", "TRAIN", "TEST"] as const).map((s) => (
                    <button key={s} type="button"
                      onClick={() => setNewQ({ ...newQ, split: s })}
                      className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${newQ.split === s ? (s === "TRAIN" ? "border-green-400 bg-green-50 text-green-700" : s === "TEST" ? "border-amber-400 bg-amber-50 text-amber-700" : "border-primary bg-primary/10 text-primary") : "border-input text-muted-foreground hover:bg-muted/50"}`}
                    >
                      {s === "TRAIN" ? "训练集" : s === "TEST" ? "测试集" : "不使用"}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={addQuestion} disabled={saving} className="w-full">添加</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Export dialog */}
        <Dialog open={saveToBankOpen} onOpenChange={setSaveToBankOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>导出题目</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-muted/30">
                <div>
                  <p className="text-sm font-medium">导出 CSV</p>
                  <p className="text-xs text-muted-foreground mt-0.5">包含 question、answer 两列</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { exportCSV(); setSaveToBankOpen(false); }}>下载</Button>
              </div>
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-3">保存到题库（{task?.questions.length} 道题目）</p>
              {availableBanks.filter((b) => !b.isSample).length > 0 && (
                <div className="space-y-1.5">
                  <Label>选择已有题库</Label>
                  <Select value={saveBankId} onValueChange={(v) => { setSaveBankId(v ?? ""); if (v) setNewBankName(""); }}>
                    <SelectTrigger>
                      <span className={`flex-1 text-left text-sm ${!saveBankId ? "text-muted-foreground" : ""}`}>
                        {availableBanks.find((b) => b.id === saveBankId)?.name || "选择题库（可选）"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">不选择（新建）</SelectItem>
                      {availableBanks.filter((b) => !b.isSample).map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name} ({b._count.items} 题)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!saveBankId && (
                <div className="space-y-1.5">
                  <Label>新建题库名称</Label>
                  <Input
                    value={newBankName}
                    onChange={(e) => setNewBankName(e.target.value)}
                    placeholder="例：写作能力测试题库"
                  />
                </div>
              )}
              <Button className="w-full" onClick={saveToBank} disabled={savingToBank || (!saveBankId && !newBankName.trim())}>
                {savingToBank ? "保存中..." : "保存"}
              </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Submission Detail Dialog */}
        <Dialog open={!!detailSub} onOpenChange={() => setDetailSub(null)}>
          <DialogContent className="w-[90vw] max-w-5xl sm:max-w-5xl max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>提交详情 — {detailSub?.user?.name}</DialogTitle>
            </DialogHeader>
            {detailSub?.promptSnapshot && (
              <div className="border rounded p-3 bg-muted/50 text-xs space-y-1">
                <p className="font-medium text-muted-foreground">Prompt / 接入方式</p>
                {detailSub.promptSnapshot.startsWith("[") ? (
                  <p className="font-mono">{detailSub.promptSnapshot}</p>
                ) : (
                  <pre className="whitespace-pre-wrap font-mono">{detailSub.promptSnapshot}</pre>
                )}
              </div>
            )}
            <div className="space-y-3">
              {detailSub?.answers?.map((ans) => {
                const isGenErr = ans.rawOutput?.startsWith("[调用失败]");
                const genErrMsg = isGenErr ? ans.rawOutput.replace(/^\[调用失败\]\s*/, "") : "";
                const errCategory = isGenErr ? classifyError(genErrMsg) : null;
                const colors = getScoreColors(ans.score);
                return (
                <div key={ans.id} className={`border border-l-4 rounded p-3 text-sm space-y-2 ${colors.border}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-xs text-muted-foreground">Q{ans.question.orderIndex + 1} <span className="ml-1">{colors.icon}</span></span>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${ans.question.split === "TRAIN" ? "text-green-600" : ans.question.split === "TEST" ? "text-amber-600" : "text-muted-foreground"}`}
                    >
                      {ans.question.split === "TRAIN" ? "训练" : ans.question.split === "TEST" ? "测试" : "不使用"}
                    </Badge>
                    {errCategory && (
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${errCategory.color}`}>{errCategory.label}</Badge>
                    )}
                    <div className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${colors.badge}`}>
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
                    <div className={`rounded p-2 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto ${isGenErr ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
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

        <Dialog open={!!resetConfirm} onOpenChange={() => setResetConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{resetConfirm === "PRELIMINARY" ? "重置到海选？" : "重置到草稿？"}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {resetConfirm === "PRELIMINARY"
                ? "这将删除所有「终赛」阶段的提交记录，并将任务状态重置为「海选」。此操作不可撤销。"
                : "这将删除该任务的所有提交记录和报名记录，并将状态重置为「草稿」。题目保留。此操作不可撤销。"}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setResetConfirm(null)}>取消</Button>
              <Button variant="destructive" onClick={() => {
                if (resetConfirm) { changeStatus(resetConfirm); setResetConfirm(null); }
              }}>
                确认重置
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

type LeaderboardRow = {
  rank: number; userId: string; name: string;
  publicScore: number; privateScore: number | null;
  submittedAt: string; submissionCount: number;
};

function LeaderboardTab({
  taskId, task, onSelectFinalists, authFetch, refreshKey,
}: {
  taskId: string;
  task: { status: string; topNForFinals: number };
  onSelectFinalists: () => void;
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  refreshKey: number;
}) {
  const { locale } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [phase, setPhase] = useState<"PRELIMINARY" | "FINALS">("PRELIMINARY");
  const [sortBy, setSortBy] = useState<"publicScore" | "privateScore">("publicScore");

  useEffect(() => {
    authFetch(`/api/tasks/${taskId}/leaderboard?phase=${phase}`)
      .then((r) => r.json())
      .then((d) => setRows(d.leaderboard || []));
  }, [taskId, phase, authFetch, refreshKey]);

  const sorted = [...rows].sort((a, b) => {
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
          <CardTitle>排行榜</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {phase === "PRELIMINARY" && (
              <Button variant="outline" size="sm" onClick={onSelectFinalists}>
                一键选 Top {task.topNForFinals} 晋级终赛
              </Button>
            )}
            {phase === "FINALS" && (
              <span className="text-xs text-muted-foreground">（前3名将成为最终获奖者）</span>
            )}
            <Button variant={phase === "PRELIMINARY" ? "default" : "outline"} size="sm" onClick={() => setPhase("PRELIMINARY")}>海选</Button>
            <Button variant={phase === "FINALS" ? "default" : "outline"} size="sm" onClick={() => setPhase("FINALS")}>终赛</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">点击列标题排序</p>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">暂无提交数据</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">排名</TableHead>
                <TableHead>姓名</TableHead>
                <SortHead col="publicScore" label="公开集得分" />
                <SortHead col="privateScore" label="测试集得分" />
                <TableHead className="text-right">提交次数</TableHead>
                <TableHead className="text-right">提交时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((e) => (
                <TableRow key={e.userId}>
                  <TableCell className="font-mono text-center">
                    {e.displayRank === 1 ? "🥇" : e.displayRank === 2 ? "🥈" : e.displayRank === 3 ? "🥉" : `#${e.displayRank}`}
                  </TableCell>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell className="text-right font-mono">{(e.publicScore * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-right font-mono">
                    {e.privateScore !== null ? `${(e.privateScore * 100).toFixed(1)}%` : "—"}
                  </TableCell>
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

function buildPodiumOrder<T extends { rank: number }>(rank1: T[], rank2: T[], rank3: T[]): T[] {
  if (rank1.length >= 3) return rank1.slice(0, 3);
  if (rank1.length === 2) return [...rank1, ...rank3.slice(0, 1)];
  // Single rank1: keep it in center regardless of how many rank2s there are
  if (rank2.length >= 2) return [rank2[0], rank1[0], rank2[1]];
  return [...rank2, ...rank1, ...rank3]; // standard: [2nd, 1st, 3rd]
}

function AwardTab({
  taskId, taskStatus, authFetch, refreshKey,
}: {
  taskId: string;
  taskStatus: string;
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  refreshKey: number;
}) {
  const [winners, setWinners] = useState<{ rank: number; userId: string; name: string; privateScore: number | null; publicScore: number }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    if (taskStatus !== "ENDED") { setLoaded(true); return; }
    // Use FINALS leaderboard when actual FINALS submissions exist; otherwise fall back to PRELIMINARY.
    authFetch(`/api/tasks/${taskId}/leaderboard?phase=FINALS`)
      .then((r) => r.json())
      .then(async (finalsData) => {
        type Row = { rank: number; userId: string; name: string; privateScore: number | null; publicScore: number; submittedAt: string; submissionCount: number };
        let rows: Row[];
        if (finalsData.hasFinalsSubmissions) {
          rows = finalsData.leaderboard || [];
        } else {
          const prelimData = await authFetch(`/api/tasks/${taskId}/leaderboard`).then((r) => r.json());
          rows = prelimData.leaderboard || [];
        }
        const sorted = [...rows].sort((a, b) => (b.privateScore ?? b.publicScore) - (a.privateScore ?? a.publicScore));
        const ranked = sorted.map((r) => ({
          ...r,
          rank: sorted.filter((o) => (o.privateScore ?? o.publicScore) > (r.privateScore ?? r.publicScore)).length + 1,
        }));
        setWinners(ranked.filter((r) => r.rank <= 3));
      })
      .finally(() => setLoaded(true));
  }, [taskId, taskStatus, authFetch, refreshKey]);

  if (!loaded) return <div className="py-16 text-center text-muted-foreground">加载中...</div>;

  if (taskStatus !== "ENDED" || winners.length === 0) {
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

  const rank1 = winners.filter((w) => w.rank === 1);
  const rank2 = winners.filter((w) => w.rank === 2);
  const rank3 = winners.filter((w) => w.rank === 3);
  const podiumOrder = buildPodiumOrder(rank1, rank2, rank3);

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

        {/* Podium */}
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

        {/* Detail table */}
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
