import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import OpenAI from "openai";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const config = await prisma.studentLLMConfig.findFirst({ where: { id, userId: user.sub } });
  if (!config) return NextResponse.json({ ok: false, message: "配置不存在" });
  if (!config.apiBaseUrl || !config.apiKey) return NextResponse.json({ ok: false, message: "请先填写 API Base URL 和 Key" });

  const body = request.headers.get("content-length") !== "0" ? await request.json().catch(() => ({})) : {};
  const models = config.models.split(",").map((m) => m.trim()).filter(Boolean);
  const testModel = (body.model as string | undefined) || models[0] || "gpt-4o-mini";

  try {
    const openai = new OpenAI({ baseURL: config.apiBaseUrl, apiKey: config.apiKey });
    const resp = await openai.chat.completions.create(
      {
        model: testModel,
        messages: [{ role: "user", content: "Hi, please respond \"OK\"." }],
        max_tokens: 20,
        stream: false,
      },
      { timeout: 90000 }
    );
    const preview = resp.choices[0]?.message?.content || "";
    return NextResponse.json({ ok: true, model: testModel, preview: preview.slice(0, 200) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "连接失败";
    return NextResponse.json({ ok: false, model: testModel, message: msg });
  }
}
