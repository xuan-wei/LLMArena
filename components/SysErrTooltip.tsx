"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

export function SysErrTooltip({ subId, authFetch }: {
  subId: string;
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
}) {
  const [answers, setAnswers] = useState<Array<{
    id: string; score: number | null; judgeReason: string | null;
    question: { orderIndex: number };
  }> | null>(null);
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

  return (
    <div className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={() => setVisible(false)}>
      <Badge variant="outline" className="cursor-help text-amber-600 border-amber-400 text-[10px]">系统错误</Badge>
      {visible && (
        <div className="absolute z-50 left-0 bottom-full mb-1 w-72 bg-background border rounded-md shadow-md p-3 text-xs space-y-2">
          {answers === null ? (
            <p className="text-muted-foreground">加载中...</p>
          ) : answers.length === 0 ? (
            <p className="text-muted-foreground">无详情</p>
          ) : (
            answers.map((ans) => {
              const isGenErr = ans.judgeReason?.startsWith("[调用失败]");
              return (
                <div key={ans.id}>
                  <p className="font-semibold mb-0.5">Q{ans.question.orderIndex + 1}</p>
                  <p className={`break-all ${isGenErr ? "text-destructive" : "text-amber-600"}`}>
                    {isGenErr
                      ? ans.judgeReason!.replace(/^\[调用失败\] /, "")
                      : (ans.judgeReason || "评分失败")}
                  </p>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
