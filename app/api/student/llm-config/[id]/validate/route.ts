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
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const config = await prisma.studentLLMConfig.findFirst({ where: { id, userId: user.sub } });
  if (!config) return NextResponse.json({ ok: false, message: st(lang, "api.configNotFound") });
  if (!config.apiBaseUrl || !config.apiKey) return NextResponse.json({ ok: false, message: st(lang, "api.apiBaseAndKeyRequired") });

  const body = request.headers.get("content-length") !== "0" ? await request.json().catch(() => ({})) : {};
  const models = config.models.split(",").map((m) => m.trim()).filter(Boolean);
  const testModel = (body.model as string | undefined) || models[0] || "gpt-4o-mini";

  try {
    const openai = new OpenAI({ baseURL: config.apiBaseUrl, apiKey: config.apiKey });
    const resp = await openai.chat.completions.create(
      {
        model: testModel,
        messages: [{ role: "user", content: MODEL_TEST_PROMPTS[lang] }],
        max_tokens: 20,
        stream: false,
      },
      { timeout: 90000 }
    );
    const preview = resp.choices[0]?.message?.content || "";
    return NextResponse.json({ ok: true, model: testModel, preview: preview.slice(0, 200) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : st(lang, "api.connectionFailed");
    return NextResponse.json({ ok: false, model: testModel, message: msg });
  }
}
