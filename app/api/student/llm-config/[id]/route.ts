import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.studentLLMConfig.findFirst({ where: { id, userId: user.sub } });
  if (!existing) return NextResponse.json({ error: st(lang, "api.configNotFound") }, { status: 404 });

  const { name, apiBaseUrl, apiKey, models } = await request.json();
  if (!name) return NextResponse.json({ error: st(lang, "api.nameRequired") }, { status: 400 });

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
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.studentLLMConfig.findFirst({ where: { id, userId: user.sub } });
  if (!existing) return NextResponse.json({ error: st(lang, "api.configNotFound") }, { status: 404 });

  await prisma.studentLLMConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
