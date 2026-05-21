import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFresh } from "@/lib/auth";
import { canManageTask } from "@/lib/permissions";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFresh(request);
  const lang = await getRequestLanguage(request);
  const { id } = await params;

  const source = await prisma.task.findUnique({
    where: { id },
    include: { questions: { orderBy: { orderIndex: "asc" } } },
  });
  if (!source) return NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 });
  if (!canManageTask(user, source.createdBy)) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }

  try {
    const task = await prisma.task.create({
      data: {
        title: `${source.title}（克隆）`,
        description: source.description,
        status: "DRAFT",
        maxPrelimSubs: source.maxPrelimSubs,
        maxFinalSubs: source.maxFinalSubs,
        topNForFinals: source.topNForFinals,
        maxTrialRuns: source.maxTrialRuns,
        judgeProfileId: source.judgeProfileId,
        adminLLMEnabled: source.adminLLMEnabled,
        adminStudentLLMConfigId: source.adminLLMEnabled ? source.adminStudentLLMConfigId : null,
        adminModel: source.adminLLMEnabled ? source.adminModel : null,
        adminPrompt: source.adminLLMEnabled ? source.adminPrompt : null,
        adminEnableThinking: source.adminLLMEnabled ? source.adminEnableThinking : false,
        adminThinkingBudget: source.adminLLMEnabled ? source.adminThinkingBudget : null,
        adminTemperature: source.adminLLMEnabled ? source.adminTemperature : null,
        adminMaxTokens: source.adminLLMEnabled ? source.adminMaxTokens : null,
        createdBy: user!.sub,
        questions: {
          create: source.questions.map((q) => ({
            content: q.content,
            answer: q.answer,
            split: q.split,
            orderIndex: q.orderIndex,
          })),
        },
      },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Clone task error:", error);
    return NextResponse.json({ error: st(lang, "api.cloneFailed") }, { status: 500 });
  }
}
