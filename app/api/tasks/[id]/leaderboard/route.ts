import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const phase = (searchParams.get("phase") || "PRELIMINARY") as "PRELIMINARY" | "FINALS";

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  const isEnded = task.status === "ENDED";
  const isAdmin = user.role === "ADMIN";

  // Only show users who are currently enrolled (not withdrawn).
  // Submissions from withdrawn users are retained in the DB but excluded from the board.
  const activeEnrollments = await prisma.enrollment.findMany({
    where: { taskId: id, ...(phase === "FINALS" ? { isFinalist: true } : {}) },
    select: { userId: true },
  });
  const activeUserIds = activeEnrollments.map((e) => e.userId);
  const userIdFilter: { in: string[] } = { in: activeUserIds };

  const phaseFilter = phase === "FINALS"
    ? { in: ["PRELIMINARY" as const, "FINALS" as const] }
    : phase;

  // Only use the isFinal submission per user
  const submissions = await prisma.submission.findMany({
    where: {
      taskId: id,
      phase: phaseFilter,
      status: "COMPLETED",
      isFinal: true,
      userId: userIdFilter,
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Total submission count per user across all phases (non-failed)
  const countRows = await prisma.submission.groupBy({
    by: ["userId"],
    where: { taskId: id, status: { not: "FAILED" } },
    _count: { id: true },
  });
  const countByUser = new Map(countRows.map((r) => [r.userId, r._count.id]));

  type Entry = {
    userId: string; name: string;
    publicScore: number; privateScore: number;
    submittedAt: Date; submissionCount: number;
  };
  const byUser = new Map<string, Entry>();

  for (const sub of submissions) {
    // For FINALS fallback: prefer FINALS submission over PRELIMINARY if both are isFinal
    const existing = byUser.get(sub.userId);
    if (!existing || sub.phase === "FINALS") {
      byUser.set(sub.userId, {
        userId: sub.userId, name: sub.user.name,
        publicScore: sub.publicScore ?? 0,
        privateScore: sub.privateScore ?? sub.finalScore ?? 0,
        submittedAt: sub.createdAt,
        submissionCount: countByUser.get(sub.userId) ?? 0,
      });
    }
  }

  // Sort by public score; when ended, sort by private score
  const sorted = [...byUser.values()].sort((a, b) =>
    isEnded ? b.privateScore - a.privateScore : b.publicScore - a.publicScore
  );

  const leaderboard = sorted.map((entry, i) => ({
    rank: i + 1,
    userId: entry.userId,
    name: entry.name,
    publicScore: Math.round(entry.publicScore * 10000) / 10000,
    privateScore: (isEnded || isAdmin)
      ? Math.round(entry.privateScore * 10000) / 10000
      : null,
    submittedAt: entry.submittedAt,
    submissionCount: entry.submissionCount,
  }));

  // Tells the client whether actual FINALS-phase submissions exist (used by award tab fallback logic)
  const hasFinalsSubmissions = phase === "FINALS"
    ? await prisma.submission.count({ where: { taskId: id, phase: "FINALS", status: "COMPLETED" } }) > 0
    : false;

  return NextResponse.json({ leaderboard, isEnded, hasFinalsSubmissions });
}
