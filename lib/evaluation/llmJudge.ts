import OpenAI from "openai";
import type { Question } from "@prisma/client";
import type { EvalResult } from "./index";

interface JudgeProfileWithConfig {
  model: string | null;
  systemPrompt: string;
  enableThinking: boolean;
  thinkingBudget: number | null;
  temperature: number | null;
  maxTokens: number | null;
  llmConfig: {
    baseUrl: string;
    apiKey: string;
  } | null;
}

export async function evaluateLLMJudge(
  rawOutput: string,
  question: Question,
  profile: JudgeProfileWithConfig | null
): Promise<EvalResult> {
  if (!profile) return heuristicScore("评分器未配置");
  if (!profile.model) return heuristicScore("评分器未选择模型");
  if (!profile.llmConfig) return heuristicScore("评分器未选择 LLM 账号");

  try {
    const client = new OpenAI({
      baseURL: profile.llmConfig.baseUrl,
      apiKey: profile.llmConfig.apiKey,
      timeout: 90000,
      maxRetries: 0,
    });

    const prompt = profile.systemPrompt
      .replace(/\{\{question\}\}/g, question.content)
      .replace(/\{\{expected\}\}/g, question.answer ?? "无")
      .replace(/\{\{output\}\}/g, rawOutput);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const create = client.chat.completions.create.bind(client.chat.completions) as any;
    const response = await create({
      model: profile.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: profile.maxTokens ?? 2048,
      stream: false,
      // Judge only needs to output a short JSON — always disable thinking
      enable_thinking: false,
      chat_template_kwargs: { enable_thinking: false },
      reasoning_budget: 0,
      ...(profile.temperature != null && { temperature: profile.temperature }),
    }) as OpenAI.Chat.ChatCompletion;

    // Strip <think>…</think> blocks — Qwen3 thinking output goes here when CoT is enabled
    const rawContent = response.choices[0]?.message?.content || "";
    const content = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    // Use brace-counting extraction instead of greedy regex, so braces inside
    // string values (e.g. LaTeX \sqrt{74}) don't cause the match to overshoot.
    const jsonStr = extractJSONObject(content);
    if (!jsonStr) {
      // Fallback: response may be truncated (max_tokens hit). Try to salvage score.
      const scoreMatch = content.match(/"score"\s*:\s*([0-9.]+)/);
      if (scoreMatch) {
        const score = Math.max(0, Math.min(1, Number(scoreMatch[1]) || 0));
        const reasonMatch = content.match(/"reason"\s*:\s*"([\s\S]*)/);
        const reason = reasonMatch ? reasonMatch[1].replace(/\\n/g, "\n") + "…（截断）" : "（评分理由被截断）";
        return { score, reason };
      }
      return heuristicScore(`Judge 未返回 JSON（原始响应：${rawContent.slice(0, 100)}）`);
    }

    let parsed: { score?: unknown; reason?: unknown };
    try {
      // Sanitize invalid JSON escape sequences (e.g. LaTeX \( \) \[ \] \{ \})
      // Valid JSON escapes: \" \\ \/ \b \f \n \r \t \uXXXX — anything else is illegal
      const sanitized = jsonStr.replace(/\\([^"\\\/bfnrtu])/g, "\\\\$1");
      parsed = JSON.parse(sanitized);
    } catch {
      // B: try to repair unescaped quotes inside the "reason" string value.
      // Strategy: locate the reason value span and escape any bare " within it.
      const repaired = repairReasonQuotes(jsonStr);
      try {
        const sanitized2 = repaired.replace(/\\([^"\\\/bfnrtu])/g, "\\\\$1");
        parsed = JSON.parse(sanitized2);
      } catch {
        // C: regex fallback — extract score and reason without relying on JSON.
        const scoreMatch = jsonStr.match(/"score"\s*:\s*([0-9.]+)/);
        if (!scoreMatch) return heuristicScore(`Judge JSON 解析失败：${jsonStr.slice(0, 80)}`);
        const score = Math.max(0, Math.min(1, Number(scoreMatch[1]) || 0));
        const reasonMatch = jsonStr.match(/"reason"\s*:\s*"([\s\S]*)/);
        // Strip trailing }" that closes the JSON object from the reason tail
        const rawReason = reasonMatch ? reasonMatch[1].replace(/\\n/g, "\n").replace(/"\s*\}?\s*$/, "") : "";
        return { score, reason: rawReason || "（评分理由无法解析）" };
      }
    }
    const score = Math.max(0, Math.min(1, Number(parsed.score) || 0));
    return { score, reason: String(parsed.reason || "") };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    return { score: null, reason: `LLM Judge 调用失败：${msg}` };
  }
}

// Repair a JSON string where the "reason" value contains unescaped double-quotes.
// Finds the reason value span by scanning character-by-character and escapes any
// bare " that appear inside it.
function repairReasonQuotes(json: string): string {
  const marker = json.match(/"reason"\s*:\s*"/);
  if (!marker || marker.index === undefined) return json;

  const valueStart = marker.index + marker[0].length; // index of first char after opening "
  let i = valueStart;
  const chars: string[] = [];
  while (i < json.length) {
    const c = json[i];
    if (c === "\\") {
      chars.push(c, json[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (c === '"') {
      // Peek ahead: if this " is followed by optional whitespace then } or ,
      // it's the closing quote of the value — stop here.
      const rest = json.slice(i + 1).trimStart();
      if (rest.startsWith("}") || rest.startsWith(",")) break;
      // Otherwise it's an unescaped quote inside the value — escape it.
      chars.push('\\"');
      i++;
      continue;
    }
    chars.push(c);
    i++;
  }
  return json.slice(0, valueStart) + chars.join("") + json.slice(i);
}

// Extract the first complete JSON object by counting braces, respecting string
// contents so that { } inside string values are not counted as nesting.
// Also validates that the result looks like a JSON object (contains : and ").
function extractJSONObject(text: string): string | null {
  let pos = 0;
  while (pos < text.length) {
    const start = text.indexOf("{", pos);
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let i = start;
    while (i < text.length) {
      const c = text[i];
      if (inString) {
        if (c === "\\") { i += 2; continue; } // skip escaped character
        if (c === '"') inString = false;
      } else {
        if (c === '"') inString = true;
        else if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) {
            const candidate = text.slice(start, i + 1);
            // Validate: JSON objects should contain at least one : and one "
            if (candidate.includes(":") && candidate.includes('"')) {
              return candidate;
            }
            // If validation fails, try the next { after this one
            pos = i + 1;
            break;
          }
        }
      }
      i++;
    }
    // Inner loop exhausted the string without finding a matching } —
    // brace is unclosed, no complete JSON object can exist from here on.
    if (i >= text.length) return null;
  }
  return null;
}

function heuristicScore(reason = "LLM Judge 未配置"): EvalResult {
  return { score: null, reason: `评分器不可用（${reason}）` };
}
