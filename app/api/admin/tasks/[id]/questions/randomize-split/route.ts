import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFresh } from "@/lib/auth";
import { canManageTask } from "@/lib/permissions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const _t = await prisma.task.findUnique({ where: { id }, select: { createdBy: true } });
  if (!_t) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (!canManageTask(user, _t.createdBy)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { trainCount, testCount } = await request.json().catch(() => ({}));

  const questions = await prisma.question.findMany({ where: { taskId: id } });
  if (questions.length === 0) {
    return NextResponse.json({ error: "没有题目" }, { status: 400 });
  }

  const total = questions.length;
  const train = Math.min(Math.max(0, trainCount ?? 0), total);
  const test = Math.min(Math.max(0, testCount ?? 0), total - train);

  // Fisher-Yates shuffle
  const shuffled = [...questions].sort(() => Math.random() - 0.5);

  await prisma.$transaction(
    shuffled.map((q, i) =>
      prisma.question.update({
        where: { id: q.id },
        data: {
          split: i < train ? "TRAIN" : i < train + test ? "TEST" : "UNUSED",
        },
      })
    )
  );

  return NextResponse.json({
    total,
    trainCount: train,
    testCount: test,
    unusedCount: total - train - test,
  });
}
