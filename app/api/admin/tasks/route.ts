import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { canPublishTasks, isAdmin } from "@/lib/permissions";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function GET(request: Request) {
  const user = await getUserFresh(request);
  const lang = await getRequestLanguage(request);
  if (!canPublishTasks(user)) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }

  // Every user sees only their own tasks
  const where = { createdBy: user.sub };

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { questions: true, enrollments: true, submissions: true } },
      judgeProfile: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const user = await getUserFresh(request);
  const lang = await getRequestLanguage(request);
  if (!canPublishTasks(user)) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      title, description, bankId, judgeProfileId, maxPrelimSubs, maxFinalSubs, topNForFinals, maxTrialRuns,
      adminLLMEnabled, adminStudentLLMConfigId, adminModel, adminEnableThinking, adminThinkingBudget, adminTemperature, adminMaxTokens,
    } = body;

    if (!title) {
      return NextResponse.json({ error: st(lang, "api.nameRequired") }, { status: 400 });
    }

    if (judgeProfileId) {
      const jp = await prisma.judgeProfile.findUnique({ where: { id: judgeProfileId }, select: { createdBy: true } });
      if (!jp || (!isAdmin(user) && jp.createdBy !== user.sub))
        return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
    }
    if (adminLLMEnabled && adminStudentLLMConfigId) {
      const cfg = await prisma.studentLLMConfig.findUnique({ where: { id: adminStudentLLMConfigId }, select: { userId: true } });
      if (!cfg || (!isAdmin(user) && cfg.userId !== user.sub))
        return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
    }

    // Validate bank ownership before creating the task
    let bankItems: { content: string; answer: string | null; orderIndex: number }[] = [];
    if (bankId) {
      const bank = await prisma.questionBank.findFirst({
        where: {
          id: bankId,
          OR: [{ isSample: true }, { createdBy: user.sub }],
        },
        include: { items: { orderBy: { orderIndex: "asc" } } },
      });
      if (!bank) return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 400 });
      bankItems = bank.items;
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: description || "",
        judgeProfileId: judgeProfileId || null,
        maxPrelimSubs: maxPrelimSubs ?? 3,
        maxFinalSubs: maxFinalSubs ?? 3,
        topNForFinals: topNForFinals ?? 10,
        maxTrialRuns: maxTrialRuns ?? 15,
        adminLLMEnabled: adminLLMEnabled ?? false,
        adminStudentLLMConfigId: adminLLMEnabled ? (adminStudentLLMConfigId || null) : null,
        adminModel: adminLLMEnabled ? (adminModel || null) : null,
        adminEnableThinking: adminLLMEnabled ? (adminEnableThinking ?? false) : false,
        adminThinkingBudget: adminLLMEnabled ? (adminThinkingBudget ?? null) : null,
        adminTemperature: adminLLMEnabled ? (adminTemperature ?? null) : null,
        adminMaxTokens: adminLLMEnabled ? (adminMaxTokens ?? null) : null,
        createdBy: user.sub,
        ...(bankItems.length > 0 && {
          questions: {
            create: bankItems.map((item, i) => ({
              content: item.content,
              answer: item.answer ?? "",
              split: "UNUSED",
              orderIndex: i,
            })),
          },
        }),
      },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Create task error:", error);
    return NextResponse.json({ error: st(lang, "api.cloneFailed") }, { status: 500 });
  }
}
