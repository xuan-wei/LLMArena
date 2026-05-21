"use client";
import { use, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { getScoreColors } from "@/lib/scoreColors";
import { SysErrTooltip } from "@/components/SysErrTooltip";

interface Submission {
  id: string;
  phase: string;
  status: string;
  version: number;
  isFinal: boolean;
  publicScore: number | null;
  finalScore: number | null;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  _count: { answers: number };
}

interface Answer {
  id: string;
  rawOutput: string;
  score: number | null;
  judgeReason: string | null;
  question: { id: string; content: string; split: string; orderIndex: number };
}

interface PublicQuestion {
  id: string;
  content: string;
  answer: string | null;
  orderIndex: number;
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  PENDING: { label: "等待中", variant: "outline" },
  RUNNING: { label: "运行中", variant: "default" },
  COMPLETED: { label: "完成", variant: "secondary" },
  FAILED: { label: "失败", variant: "destructive" },
  SYSERR: { label: "系统错误", variant: "outline" },
};

export default function SubmitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading, authFetch, locale } = useAuth();
  const router = useRouter();
  const [task, setTask] = useState<{ title: string; status: string; maxPrelimSubs: number; maxFinalSubs: number } | null>(null);
  const [isFinalist, setIsFinalist] = useState<boolean | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [publicQuestions, setPublicQuestions] = useState<PublicQuestion[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [validateDialog, setValidateDialog] = useState<{ open: boolean; status: "testing" | "success" | "fail"; message?: string }>({ open: false, status: "testing" });
  const [progressSubId, setProgressSubId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0, currentQuestion: "" });
  const [progressDone, setProgressDone] = useState(false);
  const [detailSub, setDetailSub] = useState<{ submission: { answers: Answer[] } } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  const loadData = () => {
    if (!user) return;
    Promise.all([
      authFetch(`/api/tasks/${id}`).then((r) => r.json()),
      authFetch(`/api/tasks/${id}/submissions`).then((r) => r.json()),
      authFetch(`/api/tasks/${id}/questions`).then((r) => r.json()),
      authFetch(`/api/tasks/${id}/enrollment`).then((r) => r.json()),
    ]).then(([taskData, subData, qData, enrollData]) => {
      setTask(taskData.task);
      setIsFinalist(enrollData.enrollment?.isFinalist ?? null);
      const subs: Submission[] = subData.submissions || [];
      setSubmissions(subs);
      setPublicQuestions(qData.questions || []);
      // Auto-attach progress tracking if a submission is already running (e.g. after page reload)
      const running = subs.find((s) => s.status === "RUNNING" || s.status === "PENDING");
      if (running && !progressSubId) startProgress(running.id);
    });
  };

  useEffect(() => { loadData(); }, [user, id]); // eslint-disable-line

  const handleSubmit = async () => {
    setSubmitting(true);
    setValidateDialog({ open: true, status: "testing" });
    try {
      const [valRes] = await Promise.all([
        authFetch(`/api/tasks/${id}/enrollment/validate`, { method: "POST" }),
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

      const res = await authFetch(`/api/tasks/${id}/submissions`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubmissions((prev) => [data.submission, ...prev]);
      startProgress(data.submission.id);
      toast.success("提交成功，正在评测...");
    } catch (error) {
      setValidateDialog((v) => ({ ...v, open: false }));
      toast.error(error instanceof Error ? error.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
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
      if (data.done) {
        setProgressDone(true);
        es.close();
        loadData();
      }
    };
    es.onerror = () => { es.close(); loadData(); };
  };

  const viewDetail = async (subId: string) => {
    const res = await authFetch(`/api/submissions/${subId}`);
    const data = await res.json();
    setDetailSub(data);
  };

  const toggleFinal = async (subId: string) => {
    const res = await authFetch(`/api/submissions/${subId}/final`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setSubmissions((prev) =>
        prev.map((s) => ({
          ...s,
          isFinal: s.id === subId ? data.isFinal : false,
        }))
      );
      toast.success(data.isFinal ? "已设为最终提交" : "已取消最终提交");
    }
  };

  useEffect(() => () => { eventSourceRef.current?.close(); }, []);

  if (loading || !task) return <div><Navbar backHref={`/tasks/${id}`} backLabel="返回任务" /></div>;

  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const phase = task.status === "FINALS" ? "FINALS" : "PRELIMINARY";
  const maxSubs = phase === "FINALS" ? task.maxFinalSubs : task.maxPrelimSubs;
  const currentPhaseSubs = submissions.filter((s) => s.phase === phase && s.status !== "FAILED" && s.status !== "SYSERR");
  const isLockedForFinals = phase === "FINALS" && isFinalist === false;
  const canSubmit = (task.status === "PRELIMINARY" || task.status === "FINALS") && !isLockedForFinals;

  return (
    <div>
      <Navbar
        backHref={`/tasks/${id}`}
        backLabel={task.title}
        breadcrumbs={[{ label: "我的提交" }]}
      />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{task.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              {phase === "FINALS" ? (
                isFinalist
                  ? <Badge variant="default">终赛：晋级</Badge>
                  : <Badge variant="outline" className="text-amber-700 border-amber-400">终赛：未晋级</Badge>
              ) : (
                <Badge variant="secondary">海选</Badge>
              )}
              <span className="text-sm text-muted-foreground">已提交 {currentPhaseSubs.length}/{maxSubs} 次</span>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <Link href={`/tasks/${id}/enroll`}>
              <Button variant="outline" size="sm">Chatbot 配置</Button>
            </Link>
            {canSubmit && (
              <Button onClick={handleSubmit} disabled={submitting || currentPhaseSubs.length >= maxSubs}>
                {submitting ? "提交中..." : "提交评测"}
              </Button>
            )}
          </div>
        </div>

        {isLockedForFinals && (
          <Card className="mb-4 border-amber-300 bg-amber-50">
            <CardContent className="pt-4">
              <p className="text-sm font-medium text-amber-800">您未晋级终赛，无法提交新评测。您仍可查看历史提交记录。</p>
            </CardContent>
          </Card>
        )}

        {progressSubId && !progressDone && (
          <Card className="mb-4 border-primary">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">评测中... {progress.completed}/{progress.total} 题</div>
                    {progress.total > 0 && (
                      <div className="text-sm font-medium text-primary">{pct}%</div>
                    )}
                  </div>
                  {progress.currentQuestion && (
                    <div className="text-xs text-muted-foreground truncate">{progress.currentQuestion}</div>
                  )}
                </div>
              </div>
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="submissions">
          <TabsList className="mb-4">
            <TabsTrigger value="submissions">提交记录</TabsTrigger>
            <TabsTrigger value="questions">
              公开题目（{publicQuestions.length}）
            </TabsTrigger>
          </TabsList>

          <TabsContent value="submissions">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">提交历史</CardTitle>
                <CardDescription>
                  选择一份作为「最终提交」参与排名。未选择时默认使用公开集最高分。
                </CardDescription>
              </CardHeader>
              <CardContent>
                {submissions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">暂无提交记录</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">版本</TableHead>
                        <TableHead>阶段</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="text-right">公开集得分</TableHead>
                        <TableHead className="text-right">提交时间</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {submissions.map((sub) => {
                        const st = STATUS_BADGE[sub.status];
                        return (
                          <TableRow key={sub.id} className={sub.isFinal ? "bg-primary/5" : ""}>
                            <TableCell className="font-mono font-medium">
                              v{sub.version}
                              {sub.isFinal && (
                                <Badge variant="default" className="ml-1 text-[10px] px-1 py-0">最终</Badge>
                              )}
                            </TableCell>
                            <TableCell>{sub.phase === "FINALS" ? "终赛" : "海选"}</TableCell>
                            <TableCell>
                              {sub.id === progressSubId && !progressDone ? (
                                progress.total > 0 ? (
                                  <div className="flex items-center gap-2 min-w-[100px]">
                                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-primary transition-all duration-300"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="text-xs font-medium text-primary tabular-nums">
                                      {pct}%
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary border-t-transparent" />
                                    <span className="text-xs text-muted-foreground">准备中...</span>
                                  </div>
                                )
                              ) : sub.status === "SYSERR" ? (
                                <div className="space-y-1">
                                  <SysErrTooltip subId={sub.id} authFetch={authFetch} />
                                  <p className="text-xs text-muted-foreground">不计入提交次数</p>
                                </div>
                              ) : (
                                <Badge variant={st?.variant}>{st?.label}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {sub.publicScore !== null ? `${(sub.publicScore * 100).toFixed(1)}%` : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {new Date(sub.createdAt).toLocaleString(locale)}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 justify-end">
                                {(sub.status === "COMPLETED" || sub.status === "SYSERR") && (
                                  <>
                                    <Button variant="ghost" size="sm" onClick={() => viewDetail(sub.id)}>详情</Button>
                                    {sub.status === "COMPLETED" && <Button
                                      variant={sub.isFinal ? "default" : "outline"}
                                      size="sm"
                                      onClick={() => toggleFinal(sub.id)}
                                    >
                                      {sub.isFinal ? "取消最终" : "选为最终"}
                                    </Button>}
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="questions">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">公开题集</CardTitle>
                <CardDescription>
                  评测得分基于公开题集计算（私有题目在比赛结束后揭晓）
                </CardDescription>
              </CardHeader>
              <CardContent>
                {publicQuestions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">暂无公开题目</p>
                ) : (
                  <div className="space-y-3">
                    {publicQuestions.map((q, i) => (
                      <div key={q.id} className="border rounded p-3 space-y-1.5">
                        <p className="text-xs text-muted-foreground">Q{i + 1}</p>
                        <p className="text-sm">{q.content}</p>
                        <p className="text-xs text-muted-foreground">
                          参考答案：{q.answer ?? "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={!!detailSub} onOpenChange={() => setDetailSub(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>提交详情（仅显示公开题）</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {detailSub?.submission?.answers
                ?.filter((ans) => ans.question.split === "TRAIN")
                ?.map((ans) => {
                  const isGenErr = ans.judgeReason?.startsWith("[调用失败]");
                  const colors = getScoreColors(ans.score);
                  return (
                    <div key={ans.id} className={`border border-l-4 rounded p-3 text-sm space-y-1 ${colors.border}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-xs text-muted-foreground">
                          Q{ans.question.orderIndex + 1} <span className="ml-1">{colors.icon}</span>
                        </div>
                        <div className={`px-2 py-0.5 rounded text-xs font-medium ${colors.badge}`}>
                          {ans.score !== null ? `${(ans.score * 100).toFixed(1)}%` : "N/A"}
                        </div>
                      </div>
                      <div className="text-sm">{ans.question.content}</div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{isGenErr ? "生成错误" : "LLM 输出"}</p>
                        <div className={`rounded p-2 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto ${isGenErr ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>
                          {isGenErr
                            ? ans.judgeReason!.replace(/^\[调用失败\] /, "")
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

        <Dialog open={validateDialog.open} onOpenChange={(open) => {
          if (!open && validateDialog.status === "fail") {
            setValidateDialog({ open: false, status: "testing" });
            setSubmitting(false);
          }
        }}>
          <DialogContent className="max-w-sm text-center">
            {validateDialog.status === "testing" && (
              <div className="py-6 space-y-3">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm font-medium">连通性测试中...</p>
                <p className="text-xs text-muted-foreground">正在检测 Chatbot 是否可以正常响应</p>
              </div>
            )}
            {validateDialog.status === "success" && (
              <div className="py-6 space-y-3">
                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600 text-lg">✓</div>
                <p className="text-sm font-medium">连通性测试通过</p>
              </div>
            )}
            {validateDialog.status === "fail" && (
              <div className="py-6 space-y-3">
                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600 text-lg">✗</div>
                <p className="text-sm font-medium">连通性测试失败</p>
                <p className="text-xs text-muted-foreground break-all">{validateDialog.message}</p>
                <Button size="sm" variant="outline" onClick={() => { setValidateDialog({ open: false, status: "testing" }); setSubmitting(false); }}>关闭</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
