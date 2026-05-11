import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import OpenAI from "openai";
import { callDifyStream } from "@/lib/chatbot/difyMode";
import { callCoze } from "@/lib/chatbot/cozeMode";
import type { ChatbotConfig } from "@/lib/chatbot";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  if (!user) return new Response(JSON.stringify({ error: "未登录" }), { status: 401 });

  const { id } = await params;
  const { questionId, prompt: promptOverride } = await request.json();
  if (!questionId) return new Response(JSON.stringify({ error: "缺少 questionId" }), { status: 400 });

  const enrollment = await prisma.enrollment.findUnique({
    where: { taskId_userId: { taskId: id, userId: user.sub } },
    include: {
      studentLLMConfig: true,
      task: { include: { adminStudentLLMConfig: true } },
    },
  });
  if (!enrollment) return new Response(JSON.stringify({ error: "尚未报名" }), { status: 403 });
  if (enrollment.task.status === "FINALS" && !enrollment.isFinalist) {
    return new Response(JSON.stringify({ error: "您未晋级终赛，无法试跑" }), { status: 403 });
  }

  const question = await prisma.question.findFirst({
    where: { id: questionId, taskId: id, split: "TRAIN" },
  });
  if (!question) return new Response(JSON.stringify({ error: "题目不存在或非公开题目" }), { status: 404 });

  // Build chatbot config (same logic as validate route)
  let chatbotConfig: ChatbotConfig;

  if (enrollment.task.adminLLMEnabled) {
    const cfg = enrollment.task.adminStudentLLMConfig;
    if (!cfg || !cfg.apiBaseUrl || !cfg.apiKey || !enrollment.task.adminModel) {
      return new Response(JSON.stringify({ error: "管理员尚未完成 LLM 配置" }), { status: 400 });
    }
    chatbotConfig = {
      mode: "OPENAI_COMPATIBLE",
      systemPrompt: promptOverride ?? enrollment.prompt,
      apiBaseUrl: cfg.apiBaseUrl,
      apiKey: cfg.apiKey,
      apiModel: enrollment.task.adminModel,
      enableThinking: enrollment.task.adminEnableThinking,
      thinkingBudget: enrollment.task.adminThinkingBudget,
      temperature: enrollment.task.adminTemperature,
    };
  } else if (enrollment.mode === "OPENAI_COMPATIBLE") {
    const cfg = enrollment.studentLLMConfig;
    if (!cfg || !cfg.apiBaseUrl || !cfg.apiKey || !enrollment.model) {
      return new Response(JSON.stringify({ error: "LLM 配置不完整，请先完成 Chatbot 配置" }), { status: 400 });
    }
    chatbotConfig = {
      mode: "OPENAI_COMPATIBLE",
      systemPrompt: promptOverride ?? enrollment.prompt,
      apiBaseUrl: cfg.apiBaseUrl,
      apiKey: cfg.apiKey,
      apiModel: enrollment.model,
      enableThinking: enrollment.enableThinking,
      thinkingBudget: enrollment.thinkingBudget,
      temperature: enrollment.temperature,
    };
  } else if (enrollment.mode === "DIFY") {
    if (!enrollment.difyEndpoint || !enrollment.difyApiKey) {
      return new Response(JSON.stringify({ error: "Dify 配置不完整" }), { status: 400 });
    }
    chatbotConfig = { mode: "DIFY", difyEndpoint: enrollment.difyEndpoint, difyApiKey: enrollment.difyApiKey };
  } else {
    if (!enrollment.cozeEndpoint || !enrollment.cozeApiKey || !enrollment.cozeBotId) {
      return new Response(JSON.stringify({ error: "Coze 配置不完整" }), { status: 400 });
    }
    chatbotConfig = { mode: "COZE", cozeEndpoint: enrollment.cozeEndpoint, cozeApiKey: enrollment.cozeApiKey, cozeBotId: enrollment.cozeBotId };
  }

  // Atomically check quota and increment — prevents concurrent requests bypassing the limit
  const updated = await prisma.enrollment.updateMany({
    where: { id: enrollment.id, trialRunsUsed: { lt: enrollment.task.maxTrialRuns } },
    data: { trialRunsUsed: { increment: 1 } },
  });
  if (updated.count === 0) {
    return new Response(JSON.stringify({ error: `试跑次数已用完（上限 ${enrollment.task.maxTrialRuns} 次）` }), { status: 429 });
  }

  const enc = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, data: object) => {
    controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  const questionContent = question.content;
  const cfg = chatbotConfig;

  const stream = new ReadableStream({
    async start(controller) {
      const abort = new AbortController();
      try {
        if (cfg.mode === "OPENAI_COMPATIBLE") {
          const client = new OpenAI({
            baseURL: cfg.apiBaseUrl!,
            apiKey: cfg.apiKey!,
            timeout: 180000,
            maxRetries: 0,
          });

          const prompt = cfg.systemPrompt?.trim();
          let messages: OpenAI.Chat.ChatCompletionMessageParam[];
          if (!prompt) {
            messages = [{ role: "user", content: questionContent }];
          } else if (prompt.includes("{{question}}")) {
            messages = [{ role: "user", content: prompt.replace(/\{\{question\}\}/g, questionContent) }];
          } else {
            messages = [{ role: "user", content: `${prompt}\n\n${questionContent}` }];
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const create = client.chat.completions.create.bind(client.chat.completions) as any;
          const openaiStream = await create({
            model: cfg.apiModel!,
            messages,
            max_tokens: 2000,
            stream: true,
            ...(cfg.temperature != null && { temperature: cfg.temperature }),
            enable_thinking: cfg.enableThinking ?? false,
            chat_template_kwargs: { enable_thinking: cfg.enableThinking ?? false },
            ...(cfg.enableThinking
              ? {
                  thinking_budget: cfg.thinkingBudget ?? 1024,
                  reasoning_budget: cfg.thinkingBudget ?? 1024,
                }
              : { reasoning_budget: 0 }
            ),
          }, { signal: abort.signal });

          let output = "", thinking = "";
          for await (const chunk of openaiStream) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const delta = (chunk.choices[0]?.delta) as any;
            if (delta?.reasoning_content) {
              thinking += delta.reasoning_content;
              send(controller, { type: "thinking", content: delta.reasoning_content });
            }
            if (delta?.content) {
              output += delta.content;
              send(controller, { type: "content", content: delta.content });
            }
          }
          send(controller, { type: "done", output, thinking, llmInput: { model: cfg.apiModel, messages } });

        } else if (cfg.mode === "DIFY") {
          let output = "";
          await callDifyStream(cfg, questionContent, abort.signal, (chunk) => {
            output += chunk;
            send(controller, { type: "content", content: chunk });
          });
          send(controller, { type: "done", output, thinking: "" });

        } else {
          // Coze: SSE internally but returns final answer only
          const result = await callCoze(cfg, questionContent, abort.signal);
          send(controller, { type: "content", content: result.output });
          send(controller, { type: "done", output: result.output, thinking: "" });
        }
      } catch (e) {
        send(controller, { type: "error", message: e instanceof Error ? e.message : "调用失败" });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
