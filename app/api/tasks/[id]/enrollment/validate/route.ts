import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { callChatbot, type ChatbotConfig } from "@/lib/chatbot";

const PROBE_QUESTION = "Hi, please respond \"OK\".";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const enrollment = await prisma.enrollment.findUnique({
    where: { taskId_userId: { taskId: id, userId: user.sub } },
    include: {
      studentLLMConfig: true,
      task: { include: { adminStudentLLMConfig: true } },
    },
  });
  if (!enrollment) return NextResponse.json({ ok: false, message: "尚未报名" });

  let chatbotConfig: ChatbotConfig;

  if (enrollment.task.adminLLMEnabled) {
    const cfg = enrollment.task.adminStudentLLMConfig;
    if (!cfg || !cfg.apiBaseUrl || !cfg.apiKey) {
      return NextResponse.json({ ok: false, message: "管理员尚未完成 LLM 配置" });
    }
    chatbotConfig = {
      mode: "OPENAI_COMPATIBLE",
      systemPrompt: enrollment.prompt,  // student's own system prompt
      apiBaseUrl: cfg.apiBaseUrl,
      apiKey: cfg.apiKey,
      apiModel: enrollment.task.adminModel,
      enableThinking: enrollment.task.adminEnableThinking,
      thinkingBudget: enrollment.task.adminThinkingBudget,
      temperature: enrollment.task.adminTemperature,
    };
  } else if (enrollment.mode === "OPENAI_COMPATIBLE") {
    const cfg = enrollment.studentLLMConfig;
    if (!cfg || !cfg.apiBaseUrl || !cfg.apiKey) {
      return NextResponse.json({ ok: false, message: "未选择 LLM 账号或账号缺少凭据" });
    }
    chatbotConfig = {
      mode: "OPENAI_COMPATIBLE",
      systemPrompt: enrollment.prompt,
      apiBaseUrl: cfg.apiBaseUrl,
      apiKey: cfg.apiKey,
      apiModel: enrollment.model,
      enableThinking: enrollment.enableThinking,
      thinkingBudget: enrollment.thinkingBudget,
      temperature: enrollment.temperature,
    };
  } else if (enrollment.mode === "DIFY") {
    if (!enrollment.difyEndpoint || !enrollment.difyApiKey) {
      return NextResponse.json({ ok: false, message: "Dify 配置不完整" });
    }
    chatbotConfig = { mode: "DIFY", difyEndpoint: enrollment.difyEndpoint, difyApiKey: enrollment.difyApiKey };
  } else {
    if (!enrollment.cozeEndpoint || !enrollment.cozeApiKey || !enrollment.cozeBotId) {
      return NextResponse.json({ ok: false, message: "Coze 配置不完整" });
    }
    chatbotConfig = { mode: "COZE", cozeEndpoint: enrollment.cozeEndpoint, cozeApiKey: enrollment.cozeApiKey, cozeBotId: enrollment.cozeBotId };
  }

  try {
    const { output: response } = await callChatbot(chatbotConfig, PROBE_QUESTION, 15000);
    if (!response || response.trim().length === 0) return NextResponse.json({ ok: false, message: "Chatbot 返回了空响应" });
    return NextResponse.json({ ok: true, preview: response.slice(0, 200) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "连接失败" });
  }
}
