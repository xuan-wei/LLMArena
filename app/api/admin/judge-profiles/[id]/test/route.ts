import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { canPublishTasks, isAdmin } from "@/lib/permissions";
import { getRequestLanguage, st } from "@/lib/i18n/server";
import { objectiveTemplate, subjectiveTemplate } from "@/lib/i18n/templates";
import OpenAI from "openai";

const TEST_CASES = {
  zh: {
    question: "什么是大语言模型？",
    expected: "基于 Transformer 架构、通过大规模语料预训练的语言模型",
    output: "大语言模型是一种基于深度学习的自然语言处理模型，参数量巨大，能够理解和生成人类语言。",
  },
  en: {
    question: "What is a large language model?",
    expected: "A Transformer-based language model pretrained on large-scale corpora.",
    output: "A large language model is a deep-learning model for natural language processing with many parameters that can understand and generate human language.",
  },
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  const lang = await getRequestLanguage(request);
  if (!canPublishTasks(user)) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }

  const { id } = await params;
  const profile = await prisma.judgeProfile.findUnique({
    where: { id },
    include: { llmConfig: true, studentLLMConfig: true },
  });
  if (!profile) return NextResponse.json({ error: st(lang, "api.notFound") }, { status: 404 });

  // Ownership check for non-admin
  if (!isAdmin(user) && profile.createdBy !== user.sub) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }

  // Resolve LLM credentials: admin config takes precedence, then student config
  const llmCreds = profile.llmConfig
    ? { baseUrl: profile.llmConfig.baseUrl, apiKey: profile.llmConfig.apiKey }
    : profile.studentLLMConfig?.apiBaseUrl && profile.studentLLMConfig?.apiKey
    ? { baseUrl: profile.studentLLMConfig.apiBaseUrl, apiKey: profile.studentLLMConfig.apiKey }
    : null;

  if (!llmCreds || !profile.model) {
    const msg = lang === "zh" ? "未配置 LLM 账号或模型" : "LLM account or model is not configured";
    await prisma.judgeProfile.update({
      where: { id },
      data: { lastTestStatus: "failed", lastTestedAt: new Date(), lastTestMessage: msg },
    });
    return NextResponse.json({ ok: false, error: msg });
  }

  const defaultPrompts = [objectiveTemplate("zh"), subjectiveTemplate("zh"), objectiveTemplate("en"), subjectiveTemplate("en")];
  const systemPrompt = defaultPrompts.includes(profile.systemPrompt)
    ? profile.type === "OBJECTIVE"
      ? objectiveTemplate(lang)
      : subjectiveTemplate(lang)
    : profile.systemPrompt;
  const testCase = TEST_CASES[lang];
  const prompt = systemPrompt
    .replace("{{question}}", testCase.question)
    .replace("{{expected}}", testCase.expected)
    .replace("{{output}}", testCase.output);

  try {
    const client = new OpenAI({
      baseURL: llmCreds.baseUrl,
      apiKey: llmCreds.apiKey,
      timeout: 90000,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const create = client.chat.completions.create.bind(client.chat.completions) as any;
    const response = await create({
      model: profile.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      stream: false,
      enable_thinking: false,
      chat_template_kwargs: { enable_thinking: false },
      reasoning_budget: 0,
    }) as OpenAI.ChatCompletion;
    const rawContent = response.choices[0]?.message?.content || "";
    const content = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    await prisma.judgeProfile.update({
      where: { id },
      data: { lastTestStatus: "ok", lastTestedAt: new Date(), lastTestMessage: content.slice(0, 500) },
    });

    return NextResponse.json({ ok: true, response: content });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "调用失败";
    await prisma.judgeProfile.update({
      where: { id },
      data: { lastTestStatus: "failed", lastTestedAt: new Date(), lastTestMessage: msg.slice(0, 500) },
    });
    return NextResponse.json({ ok: false, error: msg });
  }
}
