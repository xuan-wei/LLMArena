import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { submissionQueue } from "@/lib/queue";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const submissions = await prisma.submission.findMany({
    where: { taskId: id, userId: user.sub },
    orderBy: { version: "asc" },
    include: { _count: { select: { answers: true } } },
  });

  return NextResponse.json({ submissions });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: { adminStudentLLMConfig: true },
  });
  if (!task) return NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 });
  if (task.status !== "PRELIMINARY" && task.status !== "FINALS") {
    return NextResponse.json({ error: st(lang, "api.submitNotOpen") }, { status: 400 });
  }

  const phase = task.status === "FINALS" ? "FINALS" : "PRELIMINARY";

  const enrollment = await prisma.enrollment.findUnique({
    where: { taskId_userId: { taskId: id, userId: user.sub } },
  });
  if (!enrollment) {
    return NextResponse.json({ error: st(lang, "api.enrollmentRequired") }, { status: 400 });
  }

  if (phase === "FINALS" && !enrollment.isFinalist) {
    return NextResponse.json({ error: st(lang, "api.notFinalist") }, { status: 403 });
  }

  const maxSubs = phase === "FINALS" ? task.maxFinalSubs : task.maxPrelimSubs;

  // Check enrollment has valid chatbot config; also build prompt snapshot
  let promptSnapshot: string | null = null;
  if (task.adminLLMEnabled) {
    const cfg = task.adminStudentLLMConfig;
    if (!cfg || !cfg.apiBaseUrl || !cfg.apiKey) {
      return NextResponse.json({ error: st(lang, "api.adminLLMIncomplete") }, { status: 400 });
    }
    if (!task.adminModel) {
      return NextResponse.json({ error: st(lang, "api.adminModelMissing") }, { status: 400 });
    }
    promptSnapshot = enrollment.prompt || null;
  } else if (enrollment.mode === "OPENAI_COMPATIBLE") {
    const llmCfg = await prisma.studentLLMConfig.findFirst({
      where: { id: enrollment.studentLLMConfigId ?? "", userId: user.sub },
    });
    if (!llmCfg || !llmCfg.apiBaseUrl || !llmCfg.apiKey) {
      return NextResponse.json({ error: st(lang, "api.selectLLMAccount") }, { status: 400 });
    }
    if (!enrollment.model) {
      return NextResponse.json({ error: st(lang, "api.selectModel") }, { status: 400 });
    }
    promptSnapshot = enrollment.prompt || null;
  } else if (enrollment.mode === "DIFY") {
    if (!enrollment.difyEndpoint || !enrollment.difyApiKey) {
      return NextResponse.json({ error: st(lang, "api.difyIncomplete") }, { status: 400 });
    }
    promptSnapshot = `[Dify] ${enrollment.difyEndpoint}`;
  } else if (enrollment.mode === "COZE") {
    if (!enrollment.cozeEndpoint || !enrollment.cozeApiKey || !enrollment.cozeBotId) {
      return NextResponse.json({ error: st(lang, "api.cozeIncomplete") }, { status: 400 });
    }
    promptSnapshot = `[Coze] ${enrollment.cozeEndpoint} Bot: ${enrollment.cozeBotId}`;
  }

  // Atomically check limits, detect a running submission, compute version, and create.
  // A transaction serialises concurrent create attempts for the same enrollment.
  let submission;
  try {
    submission = await prisma.$transaction(async (tx) => {
      const [count, hasRunning, agg] = await Promise.all([
        tx.submission.count({
          where: { enrollmentId: enrollment.id, phase, status: { notIn: ["FAILED", "SYSERR"] } },
        }),
        tx.submission.findFirst({
          where: { enrollmentId: enrollment.id, status: { in: ["PENDING", "RUNNING"] } },
          select: { id: true },
        }),
        tx.submission.aggregate({
          where: { userId: user.sub, taskId: id },
          _max: { version: true },
        }),
      ]);
      if (count >= maxSubs) throw new Error("LIMIT");
      if (hasRunning) throw new Error("RUNNING");
      return tx.submission.create({
        data: {
          taskId: id, userId: user.sub, enrollmentId: enrollment.id,
          phase, version: (agg._max.version ?? 0) + 1, promptSnapshot,
        },
      });
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "LIMIT")
        return NextResponse.json({ error: st(lang, "api.submissionLimit", { count: maxSubs }) }, { status: 400 });
      if (err.message === "RUNNING")
        return NextResponse.json({ error: st(lang, "api.submissionRunning") }, { status: 400 });
    }
    throw err;
  }

  submissionQueue.enqueue(submission.id);

  return NextResponse.json({ submission }, { status: 201 });
}
