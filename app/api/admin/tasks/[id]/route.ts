import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { canManageTask, isAdmin } from "@/lib/permissions";
import { getRequestLanguage, st } from "@/lib/i18n/server";

async function getTaskOrForbid(id: string, request: Request, user: ReturnType<typeof getUser>) {
  const lang = await getRequestLanguage(request);
  const task = await prisma.task.findUnique({ where: { id }, select: { createdBy: true } });
  if (!task) return { error: NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 }) };
  if (!canManageTask(user, task.createdBy)) {
    return { error: NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 }) };
  }
  return { task, lang };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const check = await getTaskOrForbid(id, request, user);
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const check = await getTaskOrForbid(id, request, user);
  if (check.error) return check.error;
  const lang = check.lang!;

  try {
    const {
      title, description, judgeProfileId, maxPrelimSubs, maxFinalSubs, topNForFinals, maxTrialRuns,
      adminLLMEnabled, adminStudentLLMConfigId, adminModel, adminPrompt,
      adminEnableThinking, adminThinkingBudget, adminTemperature, adminMaxTokens,
    } = await request.json();

    if (judgeProfileId) {
      const jp = await prisma.judgeProfile.findUnique({ where: { id: judgeProfileId }, select: { createdBy: true } });
      if (!jp || (!isAdmin(user) && jp.createdBy !== user.sub))
        return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
    }
    if (adminStudentLLMConfigId) {
      const cfg = await prisma.studentLLMConfig.findUnique({ where: { id: adminStudentLLMConfigId }, select: { userId: true } });
      if (!cfg || (!isAdmin(user) && cfg.userId !== user.sub))
        return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
    }

    const adminLLMFields =
      adminLLMEnabled === false
        ? {
            adminLLMEnabled: false,
            adminStudentLLMConfigId: null,
            adminModel: null,
            adminPrompt: null,
            adminEnableThinking: false,
            adminThinkingBudget: null,
            adminTemperature: null,
            adminMaxTokens: null,
          }
        : {
            ...(adminLLMEnabled !== undefined && { adminLLMEnabled }),
            ...(adminStudentLLMConfigId !== undefined && { adminStudentLLMConfigId: adminStudentLLMConfigId || null }),
            ...(adminModel !== undefined && { adminModel: adminModel || null }),
            ...(adminPrompt !== undefined && { adminPrompt: adminPrompt || null }),
            ...(adminEnableThinking !== undefined && { adminEnableThinking }),
            ...(adminThinkingBudget !== undefined && { adminThinkingBudget: adminThinkingBudget != null ? Number(adminThinkingBudget) : null }),
            ...(adminTemperature !== undefined && { adminTemperature: adminTemperature != null ? Number(adminTemperature) : null }),
            ...(adminMaxTokens !== undefined && { adminMaxTokens: adminMaxTokens != null ? Number(adminMaxTokens) : null }),
          };

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
        ...adminLLMFields,
      },
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Update task error:", error);
    return NextResponse.json({ error: st(lang, "api.cloneFailed") }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const check2 = await getTaskOrForbid(id, request, user);
  if (check2.error) return check2.error;

  try {
    await prisma.$transaction([
      prisma.answer.deleteMany({ where: { submission: { taskId: id } } }),
      prisma.submission.deleteMany({ where: { taskId: id } }),
      prisma.enrollment.deleteMany({ where: { taskId: id } }),
      prisma.task.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete task error:", error);
    return NextResponse.json({ error: st(check2.lang!, "api.cloneFailed") }, { status: 500 });
  }
}
