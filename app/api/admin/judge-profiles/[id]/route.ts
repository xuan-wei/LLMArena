import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { isAdmin, canPublishTasks } from "@/lib/permissions";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  if (!canPublishTasks(user)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const profile = await prisma.judgeProfile.findUnique({ where: { id }, select: { createdBy: true } });
  if (!profile) return NextResponse.json({ error: "不存在" }, { status: 404 });
  if (!isAdmin(user) && profile.createdBy !== user.sub) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { name, llmConfigId, studentLLMConfigId, model, type, systemPrompt, enableThinking, thinkingBudget, temperature, maxTokens } = await request.json();
  const updated = await prisma.judgeProfile.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(llmConfigId !== undefined && { llmConfigId: llmConfigId || null }),
      ...(studentLLMConfigId !== undefined && { studentLLMConfigId: studentLLMConfigId || null }),
      ...(model !== undefined && { model: model || null }),
      ...(type && { type }),
      ...(systemPrompt !== undefined && { systemPrompt }),
      ...(enableThinking !== undefined && { enableThinking }),
      ...(thinkingBudget !== undefined && { thinkingBudget: thinkingBudget != null ? Number(thinkingBudget) : null }),
      ...(temperature !== undefined && { temperature: temperature != null ? Number(temperature) : null }),
      ...(maxTokens !== undefined && { maxTokens: maxTokens != null ? Number(maxTokens) : null }),
    },
    include: {
      llmConfig: { select: { id: true, name: true } },
      studentLLMConfig: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ profile: updated });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  if (!canPublishTasks(user)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const profile = await prisma.judgeProfile.findUnique({ where: { id }, select: { createdBy: true } });
  if (!profile) return NextResponse.json({ error: "不存在" }, { status: 404 });
  if (!isAdmin(user) && profile.createdBy !== user.sub) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  await prisma.judgeProfile.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
