import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { canManageTask } from "@/lib/permissions";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const lang = await getRequestLanguage(request);
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const _t = await prisma.task.findUnique({ where: { id }, select: { createdBy: true } });
  if (!_t) return NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 });
  if (!canManageTask(user, _t.createdBy)) return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  const { topN } = await request.json();

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 });

  const n = topN ?? task.topNForFinals;

  // Get best private (test) score per user in preliminary phase
  const submissions = await prisma.submission.findMany({
    where: { taskId: id, phase: "PRELIMINARY", status: "COMPLETED" },
    orderBy: { privateScore: "desc" },
  });

  // Best score per user (first hit = highest, since sorted desc)
  const bestByUser = new Map<string, { enrollmentId: string; score: number }>();
  for (const sub of submissions) {
    if (!bestByUser.has(sub.userId) && sub.enrollmentId) {
      bestByUser.set(sub.userId, { enrollmentId: sub.enrollmentId, score: sub.privateScore ?? 0 });
    }
  }

  // Sort by score desc, then include ALL users tied at the Nth position (扩招)
  const sorted = [...bestByUser.values()].sort((a, b) => b.score - a.score);
  const cutoffIndex = Math.min(n, sorted.length) - 1;
  const topEnrollmentIds = cutoffIndex < 0
    ? []
    : sorted.filter((e) => e.score >= sorted[cutoffIndex].score).map((e) => e.enrollmentId);

  // Reset all finalists first, then set selected ones
  await prisma.$transaction([
    prisma.enrollment.updateMany({
      where: { taskId: id },
      data: { isFinalist: false },
    }),
    prisma.enrollment.updateMany({
      where: { id: { in: topEnrollmentIds } },
      data: { isFinalist: true, trialRunsUsed: 0 },
    }),
  ]);

  return NextResponse.json({ selected: topEnrollmentIds.length });
}
