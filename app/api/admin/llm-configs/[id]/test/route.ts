import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";
import OpenAI from "openai";

const MODEL_TEST_PROMPTS = {
  zh: '你好，请只回复 "OK"。',
  en: 'Hi, please respond only with "OK".',
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user || (user.role !== "ADMIN" && !user.canPublish)) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { model } = body; // optional: test with a specific model

  const config = await prisma.lLMConfig.findUnique({ where: { id } });
  // Non-admin can only test their own configs
  if (config && user.role !== "ADMIN" && config.createdBy !== user.sub) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }
  if (!config) return NextResponse.json({ error: st(lang, "api.configNotFound") }, { status: 404 });

  // Pick first available model or use provided
  const modelList = config.models
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const testModel = model || modelList[0] || "gpt-4o-mini";

  try {
    const client = new OpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey, timeout: 90000 });
    const response = await client.chat.completions.create({
      model: testModel,
      messages: [{ role: "user", content: MODEL_TEST_PROMPTS[lang] }],
      max_tokens: 20,
    });
    const content = response.choices[0]?.message?.content || "";
    return NextResponse.json({ ok: true, model: testModel, preview: content.slice(0, 100) });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : st(lang, "api.connectionFailed"),
    });
  }
}
