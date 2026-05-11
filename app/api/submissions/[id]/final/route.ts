import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

// POST: toggle isFinal for a submission
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;

  const submission = await prisma.submission.findUnique({ where: { id } });
  if (!submission) return NextResponse.json({ error: "提交不存在" }, { status: 404 });
  if (submission.userId !== user.sub) return NextResponse.json({ error: "无权限" }, { status: 403 });
  if (submission.status !== "COMPLETED") {
    return NextResponse.json({ error: "只能选择已完成的提交" }, { status: 400 });
  }

  const isCurrentlyFinal = submission.isFinal;

  // Unset all other finals for this user+task, then toggle this one
  await prisma.submission.updateMany({
    where: { userId: user.sub, taskId: submission.taskId },
    data: { isFinal: false },
  });

  if (!isCurrentlyFinal) {
    await prisma.submission.update({ where: { id }, data: { isFinal: true } });
  }

  return NextResponse.json({ isFinal: !isCurrentlyFinal });
}
