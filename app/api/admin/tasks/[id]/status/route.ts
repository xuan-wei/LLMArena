import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { canManageTask } from "@/lib/permissions";

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PRELIMINARY"],
  PRELIMINARY: ["FINALS", "ENDED", "DRAFT"],
  FINALS: ["PRELIMINARY", "ENDED", "DRAFT"],
  ENDED: ["DRAFT"],
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const { status } = await request.json();

  const task = await prisma.task.findUnique({
    where: { id },
    include: { _count: { select: { questions: true } } },
  });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (!canManageTask(user, task.createdBy)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const allowed = VALID_TRANSITIONS[task.status] || [];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `不能从「${STATUS_LABELS[task.status]}」切换到「${STATUS_LABELS[status]}」` },
      { status: 400 }
    );
  }

  // DRAFT → PRELIMINARY: auto-generate subscribe code if not yet set
  if (task.status === "DRAFT" && status === "PRELIMINARY" && !task.subscribeCode) {
    function generateCode(): string {
      return String(Math.floor(100000 + Math.random() * 900000));
    }
    let code: string;
    let attempts = 0;
    do {
      code = generateCode();
      attempts++;
    } while (attempts <= 20 && await prisma.task.findUnique({ where: { subscribeCode: code } }));
    await prisma.task.update({ where: { id }, data: { subscribeCode: code, subscribeCodeEnabled: true } });
  }

  // Require at least 1 question before going to PRELIMINARY
  if (status === "PRELIMINARY" && task._count.questions < 1) {
    return NextResponse.json({ error: "请至少添加 1 道题目才能开始海选" }, { status: 400 });
  }

  // PRELIMINARY → FINALS: auto-select top N finalists by private (test) score
  if (task.status === "PRELIMINARY" && status === "FINALS") {
    const n = task.topNForFinals;
    const subs = await prisma.submission.findMany({
      where: { taskId: id, phase: "PRELIMINARY", status: "COMPLETED" },
      orderBy: { privateScore: "desc" },
    });
    const bestByUser = new Map<string, { enrollmentId: string; score: number }>();
    for (const sub of subs) {
      if (!bestByUser.has(sub.userId) && sub.enrollmentId) {
        bestByUser.set(sub.userId, { enrollmentId: sub.enrollmentId, score: sub.privateScore ?? 0 });
      }
    }
    // Include ALL users tied at the Nth position (扩招)
    const sorted = [...bestByUser.values()].sort((a, b) => b.score - a.score);
    const cutoffIndex = Math.min(n, sorted.length) - 1;
    const topEnrollmentIds = cutoffIndex < 0
      ? []
      : sorted.filter((e) => e.score >= sorted[cutoffIndex].score).map((e) => e.enrollmentId);
    await prisma.enrollment.updateMany({ where: { taskId: id }, data: { isFinalist: false } });
    if (topEnrollmentIds.length > 0) {
      await prisma.enrollment.updateMany({
        where: { id: { in: topEnrollmentIds } },
        data: { isFinalist: true, trialRunsUsed: 0 },
      });
    }
  }

  // FINALS → PRELIMINARY: delete finals submissions, reset finalists
  if (task.status === "FINALS" && status === "PRELIMINARY") {
    await prisma.submission.deleteMany({ where: { taskId: id, phase: "FINALS" } });
    await prisma.enrollment.updateMany({ where: { taskId: id }, data: { isFinalist: false } });
  }

  // → DRAFT: delete all submissions and enrollments
  if (status === "DRAFT") {
    await prisma.submission.deleteMany({ where: { taskId: id } });
    await prisma.enrollment.deleteMany({ where: { taskId: id } });
  }

  const updated = await prisma.task.update({ where: { id }, data: { status } });
  return NextResponse.json({ task: updated });
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  PRELIMINARY: "海选中",
  FINALS: "终赛",
  ENDED: "已结束",
};
