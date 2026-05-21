import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { isAdmin, canPublishTasks } from "@/lib/permissions";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  const lang = await getRequestLanguage(request);
  if (!user || !canPublishTasks(user)) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.lLMConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: st(lang, "api.notFound") }, { status: 404 });
  // Non-admin can only edit their own
  if (!isAdmin(user) && existing.createdBy !== user.sub) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }
  const { name, baseUrl, apiKey, models } = await request.json();
  const config = await prisma.lLMConfig.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(baseUrl && { baseUrl }),
      ...(apiKey && !apiKey.startsWith("***") && { apiKey }),
      ...(models !== undefined && { models }),
    },
  });
  return NextResponse.json({ config: { ...config, apiKey: "***" + config.apiKey.slice(-4) } });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  const lang = await getRequestLanguage(request);
  if (!user || !canPublishTasks(user)) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.lLMConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: st(lang, "api.notFound") }, { status: 404 });
  if (!isAdmin(user) && existing.createdBy !== user.sub) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }

  const profileCount = await prisma.judgeProfile.count({ where: { llmConfigId: id } });
  if (profileCount > 0) {
    return NextResponse.json(
      { error: st(lang, "api.llmConfigInUse", { count: profileCount }) },
      { status: 400 },
    );
  }

  await prisma.lLMConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
