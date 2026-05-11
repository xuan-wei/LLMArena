import type { Question } from "@prisma/client";
import { evaluateLLMJudge } from "./llmJudge";

/** Strip <think>…</think> blocks so they are not included in judge evaluation. */
export function stripThinking(output: string): string {
  return output.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export interface EvalResult {
  score: number | null;
  reason?: string;
}

interface TaskWithJudge {
  judgeProfile?: {
    model: string | null;
    systemPrompt: string;
    enableThinking: boolean;
    thinkingBudget: number | null;
    temperature: number | null;
    maxTokens: number | null;
    llmConfig: { baseUrl: string; apiKey: string; } | null;
    studentLLMConfig?: { apiBaseUrl: string | null; apiKey: string | null } | null;
  } | null;
}

export async function evaluateAnswer(
  rawOutput: string,
  question: Question,
  task: TaskWithJudge
): Promise<EvalResult> {
  const profile = task.judgeProfile ?? null;
  if (!profile) return evaluateLLMJudge(stripThinking(rawOutput), question, null);

  // Resolve LLM credentials: system LLMConfig takes precedence, then StudentLLMConfig
  const resolvedLLMConfig: { baseUrl: string; apiKey: string } | null =
    profile.llmConfig ??
    ((profile.studentLLMConfig?.apiBaseUrl && profile.studentLLMConfig?.apiKey)
      ? { baseUrl: profile.studentLLMConfig.apiBaseUrl, apiKey: profile.studentLLMConfig.apiKey }
      : null);

  return evaluateLLMJudge(stripThinking(rawOutput), question, {
    model: profile.model,
    systemPrompt: profile.systemPrompt,
    enableThinking: profile.enableThinking,
    thinkingBudget: profile.thinkingBudget,
    temperature: profile.temperature,
    maxTokens: profile.maxTokens,
    llmConfig: resolvedLLMConfig,
  });
}
