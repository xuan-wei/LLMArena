"use client";
import { use, useEffect, useState, useCallback, useRef } from "react";
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
  adminMaxTokens: number | null;
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

const STAGES_KEYS = [
  { key: "DRAFT", labelKey: "admin.task.stage.draft", shortKey: "admin.task.stage.draft.short" },
  { key: "PRELIMINARY", labelKey: "admin.task.stage.preliminary", shortKey: "admin.task.stage.preliminary.short" },
  { key: "FINALS", labelKey: "admin.task.stage.finals", shortKey: "admin.task.stage.finals.short" },
  { key: "ENDED", labelKey: "admin.task.stage.ended", shortKey: "admin.task.stage.ended.short" },
] as const;

const NEXT_STATUS: Record<string, string | null> = {
  DRAFT: "PRELIMINARY",
  PRELIMINARY: "FINALS",
  FINALS: "ENDED",
  ENDED: null,
};

const NEXT_LABEL_KEY: Record<string, string> = {
  DRAFT: "admin.task.nextStatus.draft",
  PRELIMINARY: "admin.task.nextStatus.preliminary",
  FINALS: "admin.task.nextStatus.finals",
};

const MODE_LABEL_KEYS: Record<string, string> = {
  ADMIN_LLM: "admin.task.mode.adminLlm",
  OPENAI_COMPATIBLE: "admin.task.mode.openaiCompatible",
  DIFY: "admin.task.mode.dify",
  COZE: "admin.task.mode.coze",
};

export default function AdminTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading, authFetch, locale, t } = useAuth();
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
  const formInitialized = useRef(false);

  const syncEditForm = useCallback((t: Task) => {
    setEditForm({
      title: t.title,
      description: t.description,
      judgeProfileId: t.judgeProfileId ?? "",
      maxPrelimSubs: t.maxPrelimSubs,
      maxFinalSubs: t.maxFinalSubs,
      topNForFinals: t.topNForFinals,
      maxTrialRuns: t.maxTrialRuns ?? 10,
      adminLLMEnabled: t.adminLLMEnabled ?? false,
      adminStudentLLMConfigId: t.adminStudentLLMConfigId ?? "",
      adminModel: t.adminModel ?? "",
      adminPrompt: t.adminPrompt ?? "",
      adminEnableThinking: t.adminEnableThinking ?? false,
      adminThinkingBudget: t.adminThinkingBudget != null ? String(t.adminThinkingBudget) : "",
      adminTemperature: t.adminTemperature != null ? String(t.adminTemperature) : "",
      adminMaxTokens: t.adminMaxTokens != null ? String(t.adminMaxTokens) : "",
    });
  }, []);

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

  const loadTask = useCallback((resetForm = false) =>
    authFetch(`/api/admin/tasks/${id}`).then((r) => r.json()).then((d) => {
      if (d.task) {
        setTask(d.task);
        if (resetForm || !formInitialized.current) {
          formInitialized.current = true;
          syncEditForm(d.task);
        }
      }
    }), [authFetch, id, syncEditForm]);

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
    toast.success(t("admin.task.statusSwitched", { stage: STAGES_KEYS.find((s) => s.key === status)?.labelKey ? t(STAGES_KEYS.find((s) => s.key === status)!.labelKey as any) : status }));
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
      loadTask(true);
      toast.success(t("admin.task.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("admin.task.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const addQuestion = async () => {
    if (!newQ.content) return toast.error(t("admin.task.questionEmpty"));
    setSaving(true);
    try {
      const res = await authFetch(`/api/admin/tasks/${id}/questions`, {
        method: "POST", body: JSON.stringify(newQ),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setAddOpen(false); setNewQ({ content: "", answer: "", split: "UNUSED" });
      loadTask();
      toast.success(t("admin.task.questionAdded"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("common.failed")); }
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
      toast.success(t("admin.task.importedCount", { count: data.count }));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("common.failed")); }
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
    if (!res.ok) return toast.error(t("admin.task.exportFailed"));
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
    if (!bankImportId) return toast.error(t("admin.task.selectBank"));
    if (selectedItemIds.size === 0) return toast.error(t("admin.task.selectAtLeastOne"));

    // Duplicate detection: compare selected items' content against existing questions
    const existingContents = new Set((task?.questions ?? []).map((q) => q.content.trim()));
    const selectedItems = bankImportItems.filter((it) => selectedItemIds.has(it.id));
    const duplicates = selectedItems.filter((it) => existingContents.has(it.content.trim()));
    let itemIdsToImport = Array.from(selectedItemIds);
    if (duplicates.length > 0) {
      const previewText = duplicates.slice(0, 3).map((d) => `· ${d.content.slice(0, 40)}${d.content.length > 40 ? "…" : ""}`).join("\n")
        + (duplicates.length > 3 ? t("admin.task.duplicateMore", { count: duplicates.length }) : "");
      const skip = !confirm(
        t("admin.task.duplicateConfirm", { count: duplicates.length, preview: previewText, unique: selectedItems.length - duplicates.length })
      );
      if (skip) {
        const dupIds = new Set(duplicates.map((d) => d.id));
        itemIdsToImport = itemIdsToImport.filter((id) => !dupIds.has(id));
        if (itemIdsToImport.length === 0) { toast.info(t("admin.task.allDuplicatesCancelled")); return; }
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
      toast.success(t("admin.task.importedCount", { count: data.count }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.failed"));
    } finally {
      setSaving(false);
    }
  };

  const saveToBank = async () => {
    if (!saveBankId && !newBankName.trim()) return toast.error(t("admin.task.selectBankOrName"));
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
      toast.success(t("admin.task.savedToBank", { count: data.count }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.failed"));
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
    toast.success(t("admin.task.splitDone", { train: data.trainCount, test: data.testCount, unused: data.unusedCount }));
  };

  const bulkDeleteQuestions = async (mode: "unused" | "noAnswers" | "all") => {
    const qs = task!.questions;
    const preview = mode === "unused"
      ? qs.filter((q) => q.split === "UNUSED")
      : mode === "noAnswers"
        ? qs.filter((q) => q._count.answers === 0)
        : qs;
    const labels: Record<string, string> = {
      unused: t("admin.task.deleteUnusedLabel", { count: preview.length }),
      noAnswers: t("admin.task.deleteNoAnswersLabel", { count: preview.length }),
      all: t("admin.task.deleteAllLabel", { count: preview.length }),
    };
    if (preview.length === 0) { toast.info(t("admin.task.noMatchingQuestions")); return; }
    if (!confirm(t("admin.task.confirmDeleteQuestions", { label: labels[mode] }))) return;
    const res = await authFetch(`/api/admin/tasks/${task!.id}/questions/bulk`, {
      method: "DELETE",
      body: JSON.stringify({ mode }),
    });
    if (!res.ok) { toast.error((await res.json()).error || t("admin.task.deleteFailed")); return; }
    const { count: deleted } = await res.json();
    toast.success(t("admin.task.deletedCount", { count: deleted }));
    loadTask();
  };

  const deleteQuestion = async (qid: string) => {
    const res = await authFetch(`/api/admin/questions/${qid}`, { method: "DELETE" });
    if (!res.ok) { toast.error((await res.json()).error || t("admin.task.deleteFailed")); return; }
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
    toast.success(t("admin.task.selectedFinalists", { count: data.selected }));
  };

  const deletePhaseSubmissions = async (phase: "PRELIMINARY" | "FINALS") => {
    const phaseLabel = phase === "FINALS" ? t("admin.task.phaseFinals") : t("admin.task.phasePreliminary");
    if (!confirm(t("admin.task.confirmDeletePhase", { phase: phaseLabel }))) return;
    const res = await authFetch(`/api/admin/tasks/${id}/submissions?phase=${phase}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error);
    loadSubmissions();
    toast.success(t("admin.task.deletedPhaseCount", { count: data.deleted, phase: phaseLabel }));
  };

  const retrySubmission = async (subId: string) => {
    const res = await authFetch(`/api/admin/submissions/${subId}/retry`, { method: "POST" });
    if (!res.ok) return toast.error((await res.json()).error);
    loadSubmissions();
    toast.success(t("admin.task.retryQueued"));
  };

  const deleteSubmission = async (subId: string) => {
    if (!confirm(t("admin.task.confirmDeleteSubmission"))) return;
    const res = await authFetch(`/api/admin/submissions/${subId}`, { method: "DELETE" });
    if (!res.ok) return toast.error((await res.json()).error);
    loadSubmissions();
    toast.success(t("admin.task.deleted"));
  };

  const viewSubmissionDetail = async (subId: string) => {
    const res = await authFetch(`/api/submissions/${subId}`);
    const data = await res.json();
    setDetailSub(data.submission);
  };

  if (loading || !task) return (
    <div>
      <Navbar backHref="/dashboard" backLabel={t("admin.task.backToArena")} />
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    </div>
  );

  const currentStageIdx = STAGES_KEYS.findIndex((s) => s.key === task.status);
  const nextStatus = NEXT_STATUS[task.status];

  return (
    <div>
      <Navbar
        backHref="/dashboard"
        backLabel={t("nav.dashboard")}
        breadcrumbs={[{ label: task.title }]}
      />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{task.title}</h1>
          {task.description && <p className="text-muted-foreground mt-1">{task.description}</p>}
          {task.subscribeCode && task.status !== "DRAFT" && (
            <div className="flex items-center gap-2 mt-2">
              <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1 ${task.subscribeCodeEnabled ? "border-primary/30 bg-primary/5" : "border-border bg-muted/40"}`}>
                <span className="text-xs text-muted-foreground">{t("admin.task.subscribeCode")}</span>
                <span className={`font-mono text-base font-bold tracking-widest ${task.subscribeCodeEnabled ? "text-primary" : "text-muted-foreground line-through"}`}>
                  {task.subscribeCode}
                </span>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    const code = task.subscribeCode!;
                    if (navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(code).then(() => toast.success(t("admin.task.copied")));
                    } else {
                      const el = document.createElement("textarea");
                      el.value = code;
                      el.style.position = "fixed";
                      el.style.opacity = "0";
                      document.body.appendChild(el);
                      el.select();
                      document.execCommand("copy");
                      document.body.removeChild(el);
                      toast.success(t("admin.task.copied"));
                    }
                  }}
                >{t("admin.task.copy")}</button>
                <span className="text-border">·</span>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={async () => {
                    const res = await authFetch(`/api/tasks/${id}/subscribe-code`, { method: "PATCH", body: JSON.stringify({ enabled: !task.subscribeCodeEnabled }) });
                    if (res.ok) { toast.success(task.subscribeCodeEnabled ? t("admin.task.disabled") : t("admin.task.enabled")); loadTask(); }
                  }}
                >{task.subscribeCodeEnabled ? t("admin.task.disable") : t("admin.task.enable")}</button>
                <span className="text-border">·</span>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={async () => {
                    if (!confirm(t("admin.task.regenerateConfirm"))) return;
                    const res = await authFetch(`/api/tasks/${id}/subscribe-code`, { method: "POST" });
                    if (res.ok) { toast.success(t("admin.task.regenerated")); loadTask(); }
                  }}
                >{t("admin.task.regenerate")}</button>
              </div>
            </div>
          )}
        </div>

        {/* Status stepper */}
        <Card className="mb-6">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-0">
              {STAGES_KEYS.map((stage, i) => {
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
                        {t(stage.shortKey as any)}
                      </span>
                    </div>
                    {i < STAGES_KEYS.length - 1 && (
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
                    {t(NEXT_LABEL_KEY[task.status] as any)}
                  </Button>
                )}
                {task.status === "FINALS" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/40"
                    onClick={() => setResetConfirm("PRELIMINARY")}
                  >
                    {t("admin.task.resetToPreliminary")}
                  </Button>
                )}
                {task.status !== "DRAFT" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/40"
                    onClick={() => setResetConfirm("DRAFT")}
                  >
                    {t("admin.task.resetToDraft")}
                  </Button>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {t("admin.task.enrollmentStats", { enrollments: task._count.enrollments, submissions: task._count.submissions })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="questions">
          <div className="flex items-center gap-2 mb-4">
            <TabsList>
              <TabsTrigger value="questions">{t("admin.task.tab.questions", { count: task.questions.length })}</TabsTrigger>
              <TabsTrigger value="enrollments">{t("admin.task.tab.enrollments", { count: enrollments.length })}</TabsTrigger>
              <TabsTrigger value="submissions">{t("admin.task.tab.submissions", { count: submissions.length })}</TabsTrigger>
              <TabsTrigger value="leaderboard">{t("admin.task.tab.leaderboard")}</TabsTrigger>
              <TabsTrigger value="award">{t("admin.task.tab.award")}</TabsTrigger>
              <TabsTrigger value="settings">{t("admin.task.tab.settings")}</TabsTrigger>
            </TabsList>
            <Button
              variant="outline" size="sm"
              onClick={() => { loadTask(true); loadEnrollments(); loadSubmissions(); setRefreshKey((k) => k + 1); }}
            >↻ {t("common.refresh")}</Button>
          </div>

          {/* Questions Tab */}
          <TabsContent value="questions">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="min-w-0">
                    <CardTitle>{t("admin.task.questionManagement")}</CardTitle>
                    {task.questions.length > 0 && (() => {
                      const counts = task.questions.reduce(
                        (acc, q) => { acc[q.split]++; return acc; },
                        { TRAIN: 0, TEST: 0, UNUSED: 0 }
                      );
                      return (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t("admin.task.splitStats", { train: counts.TRAIN, test: counts.TEST, unused: counts.UNUSED })}
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
                        {t("admin.task.setSplit")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={randomizeSplit}>
                        {t("admin.task.randomSplit")}
                      </Button>
                      {task.questions.length > 0 && (
                        <Button variant="outline" size="sm" onClick={() => { loadAvailableBanks(); setSaveBankId(""); setNewBankName(""); setSaveToBankOpen(true); }}>
                          {t("admin.task.export")}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => { setBankImportId(""); setBankImportItems([]); setSelectedItemIds(new Set()); loadAvailableBanks(); setBulkOpen(true); }}>
                        {t("admin.task.import")}
                      </Button>
                      <Button size="sm" onClick={() => { setNewQ({ content: "", answer: "", split: "UNUSED" }); setAddOpen(true); }}>
                        {t("admin.task.addQuestion")}
                      </Button>
                    </div>
                    {task.questions.length > 0 && (
                      <div className="flex gap-2 flex-wrap justify-end">
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive border-destructive/40 hover:border-destructive text-xs h-7"
                          title={t("admin.task.clearUnusedTitle")}
                          onClick={() => bulkDeleteQuestions("unused")}>
                          {t("admin.task.clearUnused")}
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive border-destructive/40 hover:border-destructive text-xs h-7"
                          title={t("admin.task.clearNoAnswersTitle")}
                          onClick={() => bulkDeleteQuestions("noAnswers")}>
                          {t("admin.task.clearNoAnswers")}
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive border-destructive/40 hover:border-destructive text-xs h-7"
                          title={t("admin.task.clearAllTitle")}
                          onClick={() => bulkDeleteQuestions("all")}>
                          {t("admin.task.clearAll")}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {task.questions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">{t("admin.task.noQuestions")}</p>
                ) : (
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>{t("admin.task.tableQuestion")}</TableHead>
                        <TableHead className="w-[30%]">{t("admin.task.tableAnswer")}</TableHead>
                        <TableHead className="w-20">{t("admin.task.tableSplit")}</TableHead>
                        <TableHead className="w-20 text-center">{t("admin.task.tableResponseCount")}</TableHead>
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
                              title={t("admin.task.clickToToggleSplit")}
                            >
                              {q.split === "TRAIN" ? t("admin.task.trainSet") : q.split === "TEST" ? t("admin.task.testSet") : t("admin.task.unused")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {q._count.answers > 0 ? (
                              <span className="text-xs font-medium text-blue-600" title={t("admin.task.responseCountTitle", { count: q._count.answers })}>
                                {q._count.answers}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="text-destructive h-7 px-2"
                              onClick={() => deleteQuestion(q.id)}>{t("common.delete")}</Button>
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
                <CardTitle>{t("admin.task.enrollmentManagement")}</CardTitle>
              </CardHeader>
              <CardContent>
                {enrollments.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">{t("admin.task.noEnrollments")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.task.tableName")}</TableHead>
                        <TableHead>{t("admin.task.tableEmail")}</TableHead>
                        <TableHead>{t("admin.task.tableConnectionMode")}</TableHead>
                        <TableHead className="text-right">{t("admin.task.tableSubmissionCount")}</TableHead>
                        <TableHead className="text-right">{t("admin.task.tableFinalist")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enrollments.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-medium">{e.user.name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{e.user.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{t(MODE_LABEL_KEYS[e.mode] as any) || e.mode}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{e._count.submissions}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant={e.isFinalist ? "default" : "outline"}
                              size="sm"
                              onClick={() => toggleFinalist(e.id, e.isFinalist)}
                            >
                              {e.isFinalist ? t("admin.task.isFinalist") : t("admin.task.setFinalist")}
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
                  <CardTitle>{t("admin.task.submissionRecords")}</CardTitle>
                  <div className="flex gap-2">
                    {(task.status === "PRELIMINARY" || task.status === "ENDED") && (
                      <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:bg-destructive/10"
                        onClick={() => deletePhaseSubmissions("PRELIMINARY")}>{t("admin.task.deletePrelimSubmissions")}</Button>
                    )}
                    {(task.status === "FINALS" || task.status === "ENDED") && (
                      <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:bg-destructive/10"
                        onClick={() => deletePhaseSubmissions("FINALS")}>{t("admin.task.deleteFinalsSubmissions")}</Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {submissions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">{t("admin.task.noSubmissions")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.task.tableName")}</TableHead>
                        <TableHead>{t("admin.task.tablePhase")}</TableHead>
                        <TableHead>{t("admin.task.tableStatus")}</TableHead>
                        <TableHead className="text-right">{t("admin.task.tablePublicScore")}</TableHead>
                        <TableHead className="text-right">{t("admin.task.tableFinalScore")}</TableHead>
                        <TableHead className="text-right">{t("admin.task.tableTime")}</TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {submissions.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.user.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{s.phase === "FINALS" ? t("admin.task.phaseFinals") : t("admin.task.phasePreliminary")}</Badge>
                          </TableCell>
                          <TableCell>
                            {s.status === "SYSERR" ? (
                              <SysErrTooltip subId={s.id} authFetch={authFetch} errorMessage={s.errorMessage} />
                            ) : (
                              <Badge variant={s.status === "FAILED" ? "destructive" : s.status === "COMPLETED" ? "secondary" : "outline"}>
                                {s.status === "COMPLETED" ? t("admin.task.statusCompleted") : s.status === "FAILED" ? t("admin.task.statusFailed") : s.status === "RUNNING" ? t("admin.task.statusRunning") : t("admin.task.statusPending")}
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
                              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => viewSubmissionDetail(s.id)}>{t("admin.task.detail")}</Button>
                              {(s.status === "FAILED" || s.status === "SYSERR") && (
                                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => retrySubmission(s.id)}>{t("admin.task.retry")}</Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => deleteSubmission(s.id)}>{t("common.delete")}</Button>
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
              <CardHeader><CardTitle>{t("admin.task.taskSettings")}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>{t("admin.task.taskName")}</Label>
                  <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("admin.task.taskDescription")}</Label>
                  <Textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("admin.task.judgeProfile")}</Label>
                  <Select
                    value={editForm.judgeProfileId}
                    onValueChange={(v) => setEditForm({ ...editForm, judgeProfileId: v ?? "" })}
                  >
                    <SelectTrigger>
                      <span className={`flex-1 text-left text-sm ${!editForm.judgeProfileId ? "text-muted-foreground" : ""}`}>
                        {judgeProfiles.find((p) => p.id === editForm.judgeProfileId)?.name || t("admin.task.noJudge")}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t("admin.task.noJudge")}</SelectItem>
                      {judgeProfiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.type === "OBJECTIVE" ? t("admin.task.judgeObjective") : t("admin.task.judgeSubjective")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t("admin.task.maxPrelimSubs")}</Label>
                    <Input
                      type="number" min={1}
                      value={editForm.maxPrelimSubs}
                      onChange={(e) => setEditForm({ ...editForm, maxPrelimSubs: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("admin.task.maxFinalSubs")}</Label>
                    <Input
                      type="number" min={1}
                      value={editForm.maxFinalSubs}
                      onChange={(e) => setEditForm({ ...editForm, maxFinalSubs: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("admin.task.topNForFinals")}</Label>
                    <Input
                      type="number" min={1}
                      value={editForm.topNForFinals}
                      onChange={(e) => setEditForm({ ...editForm, topNForFinals: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("admin.task.maxTrialRuns")}</Label>
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
                      {t("admin.task.enableAdminLLM")}
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    {t("admin.task.adminLLMDesc")}
                  </p>
                  {editForm.adminLLMEnabled && (
                    <div className="space-y-3 pl-2 border-l-2 border-muted">
                      <div className="space-y-1.5">
                        <Label>{t("admin.task.llmProvider")}</Label>
                        <Select
                          value={editForm.adminStudentLLMConfigId}
                          onValueChange={(v) => {
                            const cfg = llmConfigs.find((c) => c.id === v);
                            setEditForm({ ...editForm, adminStudentLLMConfigId: v ?? "", adminModel: cfg?.models.split(",")[0]?.trim() ?? "" });
                          }}
                        >
                          <SelectTrigger>
                            <span className={`flex-1 text-left text-sm ${!editForm.adminStudentLLMConfigId ? "text-muted-foreground" : ""}`}>
                              {llmConfigs.find((c) => c.id === editForm.adminStudentLLMConfigId)?.name || t("admin.task.selectLLMConfig")}
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
                        <Label>{t("admin.task.model")}</Label>
                        {editForm.adminStudentLLMConfigId && llmConfigs.find((c) => c.id === editForm.adminStudentLLMConfigId)?.models ? (
                          <Select
                            value={editForm.adminModel}
                            onValueChange={(v) => setEditForm({ ...editForm, adminModel: v ?? "" })}
                          >
                            <SelectTrigger>
                              <span className={`flex-1 text-left text-sm ${!editForm.adminModel ? "text-muted-foreground" : ""}`}>
                                {editForm.adminModel || t("admin.task.selectModel")}
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
                            placeholder={t("admin.task.enterModelName")}
                          />
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label>{t("admin.task.temperature")}</Label>
                          <Input
                            type="number" min={0} max={2} step={0.1}
                            value={editForm.adminTemperature}
                            onChange={(e) => setEditForm({ ...editForm, adminTemperature: e.target.value })}
                            placeholder={t("admin.task.temperatureDefault")}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t("admin.task.maxTokens")}</Label>
                          <Input
                            type="number" min={256} step={256}
                            value={editForm.adminMaxTokens}
                            onChange={(e) => setEditForm({ ...editForm, adminMaxTokens: e.target.value })}
                            placeholder={t("admin.task.maxTokensDefault")}
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
                            {t("admin.task.enableThinking")}
                          </Label>
                        </div>
                        {editForm.adminEnableThinking && (
                          <div className="space-y-1.5">
                            <Label>{t("admin.task.thinkingBudget")}</Label>
                            <Input
                              type="number" min={256}
                              value={editForm.adminThinkingBudget}
                              onChange={(e) => setEditForm({ ...editForm, adminThinkingBudget: e.target.value })}
                              placeholder={t("admin.task.thinkingBudgetDefault")}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <Button onClick={saveTaskInfo} disabled={saving}>
                  {saving ? t("admin.task.savingSettings") : t("admin.task.saveSettings")}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
          <DialogContent className="max-w-xl overflow-hidden">
            <DialogHeader><DialogTitle>{t("admin.task.bulkImportTitle")}</DialogTitle></DialogHeader>
            <Tabs defaultValue="bank" className="min-w-0">
              <TabsList className="w-full">
                <TabsTrigger value="bank" className="flex-1">{t("admin.task.importFromBank")}</TabsTrigger>
                <TabsTrigger value="csv" className="flex-1">{t("admin.task.importCSV")}</TabsTrigger>
              </TabsList>

              <TabsContent value="bank" className="min-w-0 space-y-3 pt-2">
                {availableBanks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">{t("admin.task.noBanksAvailable")}</p>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label>{t("admin.task.selectQuestionBank")}</Label>
                      <Select value={bankImportId} onValueChange={(v) => { setBankImportId(v ?? ""); if (v) loadBankItems(v); }}>
                        <SelectTrigger className="w-full">
                          <span className={`flex-1 text-left text-sm truncate ${!bankImportId ? "text-muted-foreground" : ""}`}>
                            {availableBanks.find((b) => b.id === bankImportId)?.name || t("admin.task.pleaseSelectBank")}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {availableBanks.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}{b.isSample ? t("admin.task.bankSample") : ""} ({t("admin.task.bankItemCount", { count: b._count.items })})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {bankImportId && (
                      <>
                        {loadingBankItems ? (
                          <p className="text-sm text-muted-foreground text-center py-4">{t("common.loading")}</p>
                        ) : bankImportItems.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">{t("admin.task.bankNoQuestions")}</p>
                        ) : (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">{t("admin.task.selectedCount", { selected: selectedItemIds.size, total: bankImportItems.length })}</span>
                              <Button
                                variant="ghost" size="sm" className="text-xs h-7"
                                onClick={() => setSelectedItemIds(
                                  selectedItemIds.size === bankImportItems.length
                                    ? new Set()
                                    : new Set(bankImportItems.map((it) => it.id))
                                )}
                              >
                                {selectedItemIds.size === bankImportItems.length ? t("admin.task.deselectAll") : t("admin.task.selectAll")}
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
                              {saving ? t("admin.task.importing") : t("admin.task.importSelected", { count: selectedItemIds.size })}
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
                  {t("admin.task.csvDesc")}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={downloadTemplate}>
                    {t("admin.task.downloadCSVTemplate")}
                  </Button>
                </div>
                <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <span className="text-sm text-muted-foreground">{t("admin.task.clickSelectCSV")}</span>
                  <span className="text-xs text-muted-foreground mt-1">{t("admin.task.utf8Encoding")}</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleCSVFile}
                    disabled={saving}
                  />
                </label>
                {saving && <p className="text-sm text-center text-muted-foreground">{t("admin.task.importingCSV")}</p>}
              </TabsContent>

            </Tabs>
          </DialogContent>
        </Dialog>

        {/* Split config dialog */}
        <Dialog open={splitDialogOpen} onOpenChange={setSplitDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{t("admin.task.splitConfigTitle")}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-1">
              <p className="text-xs text-muted-foreground">
                {t("admin.task.splitConfigDesc", { total: task?.questions.length ?? 0 })}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("admin.task.splitTrainSet")}</Label>
                  <Input type="number" min={0} max={task?.questions.length ?? 0}
                    value={splitConfig.trainCount}
                    onChange={(e) => {
                      const train = Math.max(0, parseInt(e.target.value) || 0);
                      const maxTest = (task?.questions.length ?? 0) - train;
                      setSplitConfig({ trainCount: train, testCount: Math.min(splitConfig.testCount, maxTest) });
                    }} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("admin.task.splitTestSet")}</Label>
                  <Input type="number" min={0} max={(task?.questions.length ?? 0) - splitConfig.trainCount}
                    value={splitConfig.testCount}
                    onChange={(e) => setSplitConfig({ ...splitConfig, testCount: Math.max(0, parseInt(e.target.value) || 0) })} />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("admin.task.splitUnusedCount", { count: Math.max(0, (task?.questions.length ?? 0) - splitConfig.trainCount - splitConfig.testCount) })}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSplitDialogOpen(false)}>{t("common.cancel")}</Button>
                <Button className="flex-1" onClick={() => { setSplitDialogOpen(false); randomizeSplit(); }}>{t("admin.task.randomSplitByRatio")}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("admin.task.addQuestionTitle")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("admin.task.questionContent")}</Label>
                <Textarea value={newQ.content} onChange={(e) => setNewQ({ ...newQ, content: e.target.value })} rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.task.referenceAnswer")}</Label>
                <Input value={newQ.answer} onChange={(e) => setNewQ({ ...newQ, answer: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.task.splitGroup")}</Label>
                <div className="flex gap-2">
                  {(["UNUSED", "TRAIN", "TEST"] as const).map((s) => (
                    <button key={s} type="button"
                      onClick={() => setNewQ({ ...newQ, split: s })}
                      className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${newQ.split === s ? (s === "TRAIN" ? "border-green-400 bg-green-50 text-green-700" : s === "TEST" ? "border-amber-400 bg-amber-50 text-amber-700" : "border-primary bg-primary/10 text-primary") : "border-input text-muted-foreground hover:bg-muted/50"}`}
                    >
                      {s === "TRAIN" ? t("admin.task.splitTrainLabel") : s === "TEST" ? t("admin.task.splitTestLabel") : t("admin.task.splitUnusedLabel")}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={addQuestion} disabled={saving} className="w-full">{t("admin.task.add")}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Export dialog */}
        <Dialog open={saveToBankOpen} onOpenChange={setSaveToBankOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("admin.task.exportTitle")}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-muted/30">
                <div>
                  <p className="text-sm font-medium">{t("admin.task.exportCSV")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("admin.task.exportCSVDesc")}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { exportCSV(); setSaveToBankOpen(false); }}>{t("admin.task.download")}</Button>
              </div>
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-3">{t("admin.task.saveToBankTitle", { count: task?.questions.length })}</p>
              {availableBanks.filter((b) => !b.isSample).length > 0 && (
                <div className="space-y-1.5">
                  <Label>{t("admin.task.selectExistingBank")}</Label>
                  <Select value={saveBankId} onValueChange={(v) => { setSaveBankId(v ?? ""); if (v) setNewBankName(""); }}>
                    <SelectTrigger>
                      <span className={`flex-1 text-left text-sm ${!saveBankId ? "text-muted-foreground" : ""}`}>
                        {availableBanks.find((b) => b.id === saveBankId)?.name || t("admin.task.selectBankOptional")}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t("admin.task.doNotSelect")}</SelectItem>
                      {availableBanks.filter((b) => !b.isSample).map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name} ({t("admin.task.bankItemCount", { count: b._count.items })})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!saveBankId && (
                <div className="space-y-1.5">
                  <Label>{t("admin.task.newBankName")}</Label>
                  <Input
                    value={newBankName}
                    onChange={(e) => setNewBankName(e.target.value)}
                    placeholder={t("admin.task.newBankPlaceholder")}
                  />
                </div>
              )}
              <Button className="w-full" onClick={saveToBank} disabled={savingToBank || (!saveBankId && !newBankName.trim())}>
                {savingToBank ? t("admin.task.saving") : t("common.save")}
              </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Submission Detail Dialog */}
        <Dialog open={!!detailSub} onOpenChange={() => setDetailSub(null)}>
          <DialogContent className="w-[90vw] max-w-5xl sm:max-w-5xl max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("admin.task.submissionDetail", { name: detailSub?.user?.name })}</DialogTitle>
            </DialogHeader>
            {detailSub?.promptSnapshot && (
              <div className="border rounded p-3 bg-muted/50 text-xs space-y-1">
                <p className="font-medium text-muted-foreground">{t("admin.task.promptAccessMode")}</p>
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
                      {ans.question.split === "TRAIN" ? t("admin.task.trainSet") : ans.question.split === "TEST" ? t("admin.task.testSet") : t("admin.task.unused")}
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
                        {t("admin.task.llmInput")}
                      </summary>
                      <pre className="mt-1 bg-muted rounded p-2 whitespace-pre-wrap font-mono overflow-x-auto max-h-48 overflow-y-auto">{ans.rawInput}</pre>
                    </details>
                  )}
                  {!isGenErr && ans.rawThinking && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-amber-700 hover:text-amber-900 select-none">
                        {t("admin.task.thinkingProcess")}
                      </summary>
                      <pre className="mt-1 bg-amber-50 border border-amber-200 rounded p-2 whitespace-pre-wrap font-mono overflow-x-auto max-h-64 overflow-y-auto text-amber-900">{ans.rawThinking}</pre>
                    </details>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{isGenErr ? t("admin.task.generationError") : t("admin.task.llmOutput")}</p>
                    <div className={`rounded p-2 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto ${isGenErr ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
                      {isGenErr
                        ? stripTechnicalDetails(genErrMsg)
                        : (ans.rawOutput || t("admin.task.noOutput"))}
                    </div>
                  </div>
                  {!isGenErr && ans.judgeReason && (
                    <div className={`text-xs ${ans.score === null ? "text-amber-600" : "text-muted-foreground"}`}>
                      {ans.score === null ? t("admin.task.judgeError") : t("admin.task.judgeReason")}{ans.judgeReason}
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
              <DialogTitle>{resetConfirm === "PRELIMINARY" ? t("admin.task.resetToPreliminaryConfirm") : t("admin.task.resetToDraftConfirm")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {resetConfirm === "PRELIMINARY"
                ? t("admin.task.resetToPreliminaryDesc")
                : t("admin.task.resetToDraftDesc")}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setResetConfirm(null)}>{t("common.cancel")}</Button>
              <Button variant="destructive" onClick={() => {
                if (resetConfirm) { changeStatus(resetConfirm); setResetConfirm(null); }
              }}>
                {t("admin.task.confirmReset")}
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
  const { locale, t } = useAuth();
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
          <CardTitle>{t("admin.task.leaderboardTitle")}</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {phase === "PRELIMINARY" && (
              <Button variant="outline" size="sm" onClick={onSelectFinalists}>
                {t("admin.task.autoSelectTop", { n: task.topNForFinals })}
              </Button>
            )}
            {phase === "FINALS" && (
              <span className="text-xs text-muted-foreground">{t("admin.task.finalsTop3Hint")}</span>
            )}
            <Button variant={phase === "PRELIMINARY" ? "default" : "outline"} size="sm" onClick={() => setPhase("PRELIMINARY")}>{t("admin.task.phasePreliminary")}</Button>
            <Button variant={phase === "FINALS" ? "default" : "outline"} size="sm" onClick={() => setPhase("FINALS")}>{t("admin.task.phaseFinals")}</Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("admin.task.clickToSort")}</p>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">{t("admin.task.noSubmissionData")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">{t("admin.task.tableRank")}</TableHead>
                <TableHead>{t("admin.task.tableName")}</TableHead>
                <SortHead col="publicScore" label={t("admin.task.tablePublicSetScore")} />
                <SortHead col="privateScore" label={t("admin.task.tableTestSetScore")} />
                <TableHead className="text-right">{t("admin.task.tableSubmitCount")}</TableHead>
                <TableHead className="text-right">{t("admin.task.tableSubmitTime")}</TableHead>
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
  const { t } = useAuth();
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

  if (!loaded) return <div className="py-16 text-center text-muted-foreground">{t("admin.task.awardLoading")}</div>;

  if (taskStatus !== "ENDED" || winners.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <div className="text-4xl mb-4">🏆</div>
          <p className="text-xl font-semibold text-muted-foreground">{t("admin.task.awardInProgress")}</p>
          <p className="text-sm text-muted-foreground mt-2">{t("admin.task.awardPending")}</p>
        </CardContent>
      </Card>
    );
  }

  const rank1 = winners.filter((w) => w.rank === 1);
  const rank2 = winners.filter((w) => w.rank === 2);
  const rank3 = winners.filter((w) => w.rank === 3);
  const podiumOrder = buildPodiumOrder(rank1, rank2, rank3);

  const medalInfo: Record<number, { emoji: string; color: string; height: string; label: string }> = {
    1: { emoji: "🥇", color: "from-yellow-400 to-amber-500", height: "h-36", label: t("admin.task.medalGold") },
    2: { emoji: "🥈", color: "from-slate-300 to-slate-400", height: "h-24", label: t("admin.task.medalSilver") },
    3: { emoji: "🥉", color: "from-amber-600 to-amber-700", height: "h-16", label: t("admin.task.medalBronze") },
  };

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-b from-primary/10 to-background px-6 pt-10 pb-6">
        <h2 className="text-2xl font-bold text-center mb-2">🎊 {t("admin.task.awardCeremony")} 🎊</h2>
        <p className="text-center text-muted-foreground text-sm mb-10">{t("admin.task.awardFinalRanking")}</p>

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
