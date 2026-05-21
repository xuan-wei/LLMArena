import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { callChatbot, type ChatbotConfig } from "@/lib/chatbot";
import { getRequestLanguage, st } from "@/lib/i18n/server";

const PROBE_QUESTIONS = {
  zh: '你好，请只回复 "OK"。',
  en: 'Hi, please respond only with "OK".',
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const enrollment = await prisma.enrollment.findUnique({
    where: { taskId_userId: { taskId: id, userId: user.sub } },
    include: {
      studentLLMConfig: true,
      task: { include: { adminStudentLLMConfig: true } },
    },
  });
  if (!enrollment) return NextResponse.json({ ok: false, message: st(lang, "api.validateNotEnrolled") });

  let chatbotConfig: ChatbotConfig;

  if (enrollment.task.adminLLMEnabled) {
    const cfg = enrollment.task.adminStudentLLMConfig;
    if (!cfg || !cfg.apiBaseUrl || !cfg.apiKey) {
      return NextResponse.json({ ok: false, message: st(lang, "api.adminLLMIncomplete") });
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
      return NextResponse.json({ ok: false, message: st(lang, "api.selectLLMAccount") });
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
      return NextResponse.json({ ok: false, message: st(lang, "api.difyIncomplete") });
    }
    chatbotConfig = { mode: "DIFY", difyEndpoint: enrollment.difyEndpoint, difyApiKey: enrollment.difyApiKey };
  } else {
    if (!enrollment.cozeEndpoint || !enrollment.cozeApiKey || !enrollment.cozeBotId) {
      return NextResponse.json({ ok: false, message: st(lang, "api.cozeIncomplete") });
    }
    chatbotConfig = { mode: "COZE", cozeEndpoint: enrollment.cozeEndpoint, cozeApiKey: enrollment.cozeApiKey, cozeBotId: enrollment.cozeBotId };
  }

  try {
    const { output: response } = await callChatbot(chatbotConfig, PROBE_QUESTIONS[lang], 30000);
    if (!response || response.trim().length === 0) return NextResponse.json({ ok: false, message: st(lang, "api.emptyChatbotResponse") });

    return NextResponse.json({ ok: true, preview: response.slice(0, 200) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : st(lang, "api.connectionFailed") });
  }
}
