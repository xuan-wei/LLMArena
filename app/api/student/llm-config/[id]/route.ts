import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.studentLLMConfig.findFirst({ where: { id, userId: user.sub } });
  if (!existing) return NextResponse.json({ error: "配置不存在" }, { status: 404 });

  const { name, apiBaseUrl, apiKey, models } = await request.json();
  if (!name) return NextResponse.json({ error: "名称不能为空" }, { status: 400 });

  const resolvedKey = apiKey && !apiKey.startsWith("***") ? apiKey : existing.apiKey;

  const config = await prisma.studentLLMConfig.update({
    where: { id },
    data: { name, apiBaseUrl: apiBaseUrl ?? null, apiKey: resolvedKey, models: models ?? "" },
  });

  return NextResponse.json({ config });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.studentLLMConfig.findFirst({ where: { id, userId: user.sub } });
  if (!existing) return NextResponse.json({ error: "配置不存在" }, { status: 404 });

  await prisma.studentLLMConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
