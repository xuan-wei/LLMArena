"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { toast } from "sonner";
import { ConnectivityTestDialog } from "@/components/ConnectivityTestDialog";
import { translateSystemText } from "@/lib/i18n";

type Mode = "OPENAI_COMPATIBLE" | "DIFY" | "COZE";

const MODE_LABELS: Record<Mode, string> = {
  OPENAI_COMPATIBLE: "LLM（OpenAI 兼容 API）",
  DIFY: "Dify Chatbot",
  COZE: "Coze Chatbot",
};

export default function EnrollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading, authFetch, locale } = useAuth();
  const router = useRouter();
  const tr = (text: string) => translateSystemText(locale === "zh-CN" ? "zh" : "en", text);

  const [task, setTask] = useState<{ title: string; status: string } | null>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [isFinalist, setIsFinalist] = useState<boolean | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [testDialog, setTestDialog] = useState<{ open: boolean; status: "testing" | "success" | "fail"; message?: string; preview?: string }>({ open: false, status: "testing" });

  // Chatbot config form
  const [mode, setMode] = useState<Mode>("OPENAI_COMPATIBLE");
  const [prompt, setPrompt] = useState("请回答以下问题：\n\n{{question}}");
  const [model, setModel] = useState("");
  const [difyEndpoint, setDifyEndpoint] = useState("");
  const [difyApiKey, setDifyApiKey] = useState("");
  const [cozeEndpoint, setCozeEndpoint] = useState("https://api.coze.cn");
  const [cozeApiKey, setCozeApiKey] = useState("");
  const [cozeBotId, setCozeBotId] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      authFetch(`/api/tasks/${id}`).then((r) => r.json()),
      authFetch(`/api/tasks/${id}/enrollment`).then((r) => r.json()),
      authFetch("/api/student/llm-config").then((r) => r.json()),
    ]).then(([taskData, enrollData, configData]) => {
      setTask(taskData.task);
      if (enrollData.enrollment) {
        setIsEnrolled(true);
        setIsFinalist(enrollData.enrollment.isFinalist ?? false);
        const e = enrollData.enrollment;
        setMode(e.mode || "OPENAI_COMPATIBLE");
        setPrompt(e.prompt || "请回答以下问题：\n\n{{question}}");
        setModel(e.model || "");
        setDifyEndpoint(e.difyEndpoint || "");
        setDifyApiKey(e.difyApiKey || "");
        setCozeEndpoint(e.cozeEndpoint || "https://api.coze.cn");
        setCozeApiKey(e.cozeApiKey || "");
        setCozeBotId(e.cozeBotId || "");
      }
      if (configData.config?.models) {
        setAvailableModels(
          configData.config.models.split(",").map((m: string) => m.trim()).filter(Boolean)
        );
      }
    });
  }, [user, id, authFetch]);

  const handleEnroll = async () => {
    setSaving(true);
    try {
      const res = await authFetch(`/api/tasks/${id}/enrollment`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIsEnrolled(true);
      toast.success("报名成功！请继续配置 Chatbot。");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "报名失败");
    } finally {
      setSaving(false);
    }
  };

  const handleWithdraw = async () => {
    setSaving(true);
    try {
      const res = await authFetch(`/api/tasks/${id}/enrollment`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setIsEnrolled(false);
      toast.success("已取消报名");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!isEnrolled) return toast.error("请先报名");
    setSaving(true);
    try {
      const res = await authFetch(`/api/tasks/${id}/enrollment`, {
        method: "PUT",
        body: JSON.stringify({ mode, prompt, model, difyEndpoint, difyApiKey, cozeEndpoint, cozeApiKey, cozeBotId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Chatbot 配置已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    if (mode === "DIFY" && (!difyApiKey || !difyEndpoint)) {
      toast.error(tr("Dify 配置不完整，请填写 API Endpoint 和 API Key"));
      return;
    }
    if (mode === "COZE" && (!cozeApiKey || !cozeEndpoint || !cozeBotId)) {
      toast.error(tr("Coze 配置不完整，请填写 API Endpoint、API Key 和 Bot ID"));
      return;
    }
    setValidating(true);
    setTestDialog({ open: true, status: "testing" });
    try {
      const [res] = await Promise.all([
        authFetch(`/api/tasks/${id}/enrollment/validate`, { method: "POST" }),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
      const data = await (res as Response).json();
      if (data.ok) {
        setTestDialog({ open: true, status: "success", preview: data.preview });
        setTimeout(() => setTestDialog((v) => ({ ...v, open: false })), 2000);
      } else {
        setTestDialog({ open: true, status: "fail", message: data.message || "连接失败" });
      }
    } catch {
      setTestDialog({ open: true, status: "fail", message: "测试请求失败" });
    } finally {
      setValidating(false);
    }
  };

  if (loading) return <div><Navbar backHref={`/tasks/${id}`} backLabel="返回任务" /></div>;

  const isLockedForFinals = task?.status === "FINALS" && isFinalist === false;
  const canEditConfig = isEnrolled && !isLockedForFinals;

  return (
    <div>
      <Navbar
        backHref={`/tasks/${id}`}
        backLabel={task?.title || "返回"}
        breadcrumbs={[{ label: "报名与 Chatbot 配置" }]}
      />
      <main className="max-w-xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">报名与 Chatbot 配置</h1>

        {/* Enrollment status */}
        <Card className="mb-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>报名状态</CardTitle>
              <Badge variant={isEnrolled ? "default" : "outline"}>
                {isEnrolled ? "已报名" : "未报名"}
              </Badge>
            </div>
            <CardDescription>
              {task?.status === "PRELIMINARY"
                ? "当前处于海选阶段，可以报名或取消报名"
                : "当前不在报名阶段"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {task?.status === "PRELIMINARY" && (
              isEnrolled ? (
                <Button variant="outline" onClick={handleWithdraw} disabled={saving}>
                  {saving ? "操作中..." : "取消报名"}
                </Button>
              ) : (
                <Button onClick={handleEnroll} disabled={saving}>
                  {saving ? "报名中..." : "确认报名"}
                </Button>
              )
            )}
            {isEnrolled && task?.status !== "PRELIMINARY" && (
              <p className="text-sm text-muted-foreground">你已报名此任务</p>
            )}
          </CardContent>
        </Card>

        {/* Non-finalist lock notice */}
        {isLockedForFinals && (
          <Card className="mb-4 border-amber-300 bg-amber-50">
            <CardContent className="pt-4">
              <p className="text-sm font-medium text-amber-800">您未晋级终赛，无法继续编辑 Chatbot 配置。</p>
            </CardContent>
          </Card>
        )}

        {/* Chatbot config */}
        {canEditConfig && (
          <Card>
            <CardHeader>
              <CardTitle>Chatbot 配置</CardTitle>
              <CardDescription>选择你的接入方式并填写对应配置</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>接入方式</Label>
                <Select value={mode} onValueChange={(v) => v && setMode(v as Mode)}>
                  <SelectTrigger>
                    <span className="flex-1 text-left text-sm">{MODE_LABELS[mode]}</span>
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
                  {availableModels.length === 0 ? (
                    <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      ⚠️ 你还没有配置 LLM API 凭据。
                      <Link href="/account/llm-config" className="underline font-medium ml-1">去配置</Link>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label>选择模型</Label>
                    {availableModels.length > 0 ? (
                      <Select value={model} onValueChange={(v) => v && setModel(v)}>
                        <SelectTrigger>
                          <span className={`flex-1 text-left text-sm ${!model ? "text-muted-foreground" : ""}`}>
                            {model || "选择模型"}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {availableModels.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="gpt-4o-mini"
                      />
                    )}
                    <p className="text-xs text-muted-foreground">
                      模型列表来自你的{" "}
                      <Link href="/account/llm-config" className="underline">LLM配置</Link>。
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Prompt 模板</Label>
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={5}
                      placeholder={"请回答以下问题：\n\n{{question}}"}
                    />
                    <p className="text-xs text-muted-foreground">
                题目占位符为 <code className="bg-muted px-1 rounded">{"{{question}}"}</code>，输入给大模型之前，<code className="bg-muted px-1 rounded">{"{{question}}"}</code> 会替换成问题题干；你可以根据情况将其放在 Prompt 的不同位置。
                <br />
                若 Prompt 不含占位符<code className="bg-muted px-1 rounded">{"{{question}}"}</code>，系统会自动在末尾追加题目内容。
              </p>
                  </div>
                </>
              )}

              {mode === "DIFY" && (
                <>
                  <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                    题目内容将直接发送给 Dify Chatbot，请在 Dify 平台上配置好你的 Chatbot 逻辑。
                  </div>
                  <div className="space-y-2">
                    <Label>Dify API Endpoint</Label>
                    <Input
                      value={difyEndpoint}
                      onChange={(e) => setDifyEndpoint(e.target.value)}
                      placeholder="https://api.dify.ai"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <Input
                      type="password"
                      value={difyApiKey}
                      onChange={(e) => setDifyApiKey(e.target.value)}
                      placeholder="app-..."
                    />
                  </div>
                </>
              )}

              {mode === "COZE" && (
                <>
                  <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                    题目内容将直接发送给 Coze Bot，请在 Coze 平台上配置好你的 Bot 逻辑。
                  </div>
                  <div className="space-y-2">
                    <Label>Coze API Endpoint</Label>
                    <Input
                      value={cozeEndpoint}
                      onChange={(e) => setCozeEndpoint(e.target.value)}
                      placeholder="https://api.coze.cn"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <Input
                      type="password"
                      value={cozeApiKey}
                      onChange={(e) => setCozeApiKey(e.target.value)}
                      placeholder="..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Bot ID</Label>
                    <Input
                      value={cozeBotId}
                      onChange={(e) => setCozeBotId(e.target.value)}
                      placeholder="..."
                    />
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSaveConfig} disabled={saving}>
                  {saving ? "保存中..." : "保存配置"}
                </Button>
                <Button variant="outline" onClick={handleValidate} disabled={validating}>
                  {validating ? "测试中..." : "连通性测试"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
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
