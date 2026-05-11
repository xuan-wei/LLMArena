import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { canPublishTasks, isAdmin } from "@/lib/permissions";
import OpenAI from "openai";

const TEST_QUESTION = "什么是大语言模型？";
const TEST_EXPECTED = "基于 Transformer 架构、通过大规模语料预训练的语言模型";
const TEST_OUTPUT = "大语言模型是一种基于深度学习的自然语言处理模型，参数量巨大，能够理解和生成人类语言。";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  if (!canPublishTasks(user)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const profile = await prisma.judgeProfile.findUnique({
    where: { id },
    include: { llmConfig: true, studentLLMConfig: true },
  });
  if (!profile) return NextResponse.json({ error: "不存在" }, { status: 404 });

  // Ownership check for non-admin
  if (!isAdmin(user) && profile.createdBy !== user.sub) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  // Resolve LLM credentials: admin config takes precedence, then student config
  const llmCreds = profile.llmConfig
    ? { baseUrl: profile.llmConfig.baseUrl, apiKey: profile.llmConfig.apiKey }
    : profile.studentLLMConfig?.apiBaseUrl && profile.studentLLMConfig?.apiKey
    ? { baseUrl: profile.studentLLMConfig.apiBaseUrl, apiKey: profile.studentLLMConfig.apiKey }
    : null;

  if (!llmCreds || !profile.model) {
    await prisma.judgeProfile.update({
      where: { id },
      data: { lastTestStatus: "failed", lastTestedAt: new Date(), lastTestMessage: "未配置 LLM 账号或模型" },
    });
    return NextResponse.json({ ok: false, error: "未配置 LLM 账号或模型" });
  }

  const prompt = profile.systemPrompt
    .replace("{{question}}", TEST_QUESTION)
    .replace("{{expected}}", TEST_EXPECTED)
    .replace("{{output}}", TEST_OUTPUT);

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
