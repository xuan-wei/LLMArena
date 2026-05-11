import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { canManageTask } from "@/lib/permissions";

async function getTaskOrForbid(id: string, user: ReturnType<typeof getUser>) {
  const task = await prisma.task.findUnique({ where: { id }, select: { createdBy: true } });
  if (!task) return { error: NextResponse.json({ error: "任务不存在" }, { status: 404 }) };
  if (!canManageTask(user, task.createdBy)) {
    return { error: NextResponse.json({ error: "无权限" }, { status: 403 }) };
  }
  return { task };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  const { id } = await params;
  const check = await getTaskOrForbid(id, user);
  if (check.error) return check.error;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { orderIndex: "asc" }, include: { _count: { select: { answers: true } } } },
      judgeProfile: { include: { llmConfig: { select: { id: true, name: true } } } },
      adminStudentLLMConfig: { select: { id: true, name: true, models: true } },
      _count: { select: { enrollments: true, submissions: true } },
    },
  });

  return NextResponse.json({ task });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  const { id } = await params;
  const check = await getTaskOrForbid(id, user);
  if (check.error) return check.error;

  try {
    const {
      title, description, judgeProfileId, maxPrelimSubs, maxFinalSubs, topNForFinals, maxTrialRuns,
      adminLLMEnabled, adminStudentLLMConfigId, adminModel, adminPrompt,
      adminEnableThinking, adminThinkingBudget, adminTemperature, adminMaxTokens,
    } = await request.json();

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(judgeProfileId !== undefined && { judgeProfileId: judgeProfileId || null }),
        ...(maxPrelimSubs !== undefined && { maxPrelimSubs }),
        ...(maxFinalSubs !== undefined && { maxFinalSubs }),
        ...(topNForFinals !== undefined && { topNForFinals }),
        ...(maxTrialRuns !== undefined && { maxTrialRuns }),
        ...(adminLLMEnabled !== undefined && { adminLLMEnabled }),
        ...(adminStudentLLMConfigId !== undefined && { adminStudentLLMConfigId: adminStudentLLMConfigId || null }),
        ...(adminModel !== undefined && { adminModel: adminModel || null }),
        ...(adminPrompt !== undefined && { adminPrompt: adminPrompt || null }),
        ...(adminEnableThinking !== undefined && { adminEnableThinking }),
        ...(adminThinkingBudget !== undefined && { adminThinkingBudget: adminThinkingBudget != null ? Number(adminThinkingBudget) : null }),
        ...(adminTemperature !== undefined && { adminTemperature: adminTemperature != null ? Number(adminTemperature) : null }),
        ...(adminMaxTokens !== undefined && { adminMaxTokens: adminMaxTokens != null ? Number(adminMaxTokens) : null }),
      },
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Update task error:", error);
    return NextResponse.json({ error: "更新任务失败" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  const { id } = await params;
  const check = await getTaskOrForbid(id, user);
  if (check.error) return check.error;

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
