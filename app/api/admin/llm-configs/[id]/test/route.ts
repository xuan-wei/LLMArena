import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import OpenAI from "openai";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  if (!user || (user.role !== "ADMIN" && !user.canPublish)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { model } = body; // optional: test with a specific model

  const config = await prisma.lLMConfig.findUnique({ where: { id } });
  // Non-admin can only test their own configs
  if (config && user.role !== "ADMIN" && config.createdBy !== user.sub) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  if (!config) return NextResponse.json({ error: "配置不存在" }, { status: 404 });

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
      messages: [{ role: "user", content: "Reply with: OK" }],
      max_tokens: 20,
    });
    const content = response.choices[0]?.message?.content || "";
    return NextResponse.json({ ok: true, model: testModel, preview: content.slice(0, 100) });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "连接失败",
    });
  }
}
