"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

type ErrorCategory = {
  label: string;
  color: string;
};

export function classifyError(msg: string): ErrorCategory {
  const lower = msg.toLowerCase();
  if (/config incomplete|未配置|未选择|配置不完整|not configured/.test(msg))
    return { label: "配置错误", color: "text-amber-600" };
  if (/\b40[13]\b|unauthorized|authentication|invalid.*key|invalid api/i.test(msg))
    return { label: "认证错误", color: "text-red-600" };
  if (/timeout|超时|etimedout|timed?\s*out/i.test(lower))
    return { label: "请求超时", color: "text-amber-600" };
  if (/econnrefused|enotfound|fetch failed|connection|socket hang up|\b50[234]\b|network/i.test(lower))
    return { label: "网络错误", color: "text-red-600" };
  if (/empty|no answer|no response|空响应/i.test(lower))
    return { label: "空响应", color: "text-amber-600" };
  if (/judge|评分器|json/i.test(lower))
    return { label: "评分失败", color: "text-amber-600" };
  return { label: "其他错误", color: "text-muted-foreground" };
}

export function stripTechnicalDetails(msg: string): string {
  return msg.replace(/\s*\[model=[^\]]*\]/, "").replace(/\s*\[mode=[^\]]*\]/, "");
}

export function classifySubmissionError(errorMessage: string | null | undefined): ErrorCategory {
  if (!errorMessage) return { label: "系统错误", color: "text-amber-600" };
  return classifyError(errorMessage);
}

type AnswerInfo = {
  id: string;
  score: number | null;
  rawOutput: string;
  judgeReason: string | null;
  question: { orderIndex: number };
};

export function SysErrTooltip({ subId, authFetch, errorMessage }: {
  subId: string;
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  errorMessage?: string | null;
}) {
  const badgeInfo = classifySubmissionError(errorMessage);
  const [answers, setAnswers] = useState<AnswerInfo[] | null>(null);
  const [visible, setVisible] = useState(false);

  const handleMouseEnter = () => {
    setVisible(true);
    if (answers === null) {
      authFetch(`/api/submissions/${subId}`)
        .then((r) => r.json())
        .then((d) => setAnswers(d.submission?.answers ?? []))
        .catch(() => setAnswers([]));
    }
  };

  const getAnswerError = (ans: AnswerInfo): { msg: string; category: ErrorCategory } | null => {
    if (ans.rawOutput?.startsWith("[调用失败]")) {
      const raw = ans.rawOutput.replace(/^\[调用失败\]\s*/, "");
      return { msg: stripTechnicalDetails(raw), category: classifyError(raw) };
    }
    if (ans.score === null && ans.judgeReason) {
      return { msg: stripTechnicalDetails(ans.judgeReason), category: classifyError(ans.judgeReason) };
    }
    if (ans.score === null && !ans.rawOutput) {
      return { msg: "未完成（已中止）", category: { label: "已中止", color: "text-muted-foreground" } };
    }
    return null;
  };

  return (
    <div className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={() => setVisible(false)}>
      <Badge variant="outline" className={`cursor-help border-amber-400 text-[10px] ${badgeInfo.color}`}>{badgeInfo.label}</Badge>
      {visible && (
        <div className="absolute z-50 left-0 bottom-full mb-1 w-80 bg-background border rounded-md shadow-md p-3 text-xs space-y-2 max-h-64 overflow-y-auto">
          {answers === null ? (
            <p className="text-muted-foreground">加载中...</p>
          ) : answers.length === 0 ? (
            <p className="text-muted-foreground">无详情</p>
          ) : (
            <>
              {(() => {
                const errors = answers.map((a) => getAnswerError(a)).filter(Boolean);
                const categories = new Map<string, number>();
                for (const e of errors) {
                  if (e) categories.set(e.category.label, (categories.get(e.category.label) ?? 0) + 1);
                }
                if (categories.size > 0) {
                  return (
                    <p className="text-muted-foreground border-b pb-1.5 mb-1">
                      {Array.from(categories.entries()).map(([label, count]) => `${count} 题${label}`).join("，")}
                    </p>
                  );
                }
                return null;
              })()}
              {answers.map((ans) => {
                const err = getAnswerError(ans);
                if (!err) return null;
                return (
                  <div key={ans.id}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-semibold">Q{ans.question.orderIndex + 1}</span>
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${err.category.color}`}>{err.category.label}</Badge>
                    </div>
                    <p className={`break-all ${err.category.color}`}>{err.msg}</p>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
