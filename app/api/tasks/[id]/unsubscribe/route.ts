import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: taskId } = await params;

  const enrollment = await prisma.enrollment.findUnique({
    where: { taskId_userId: { taskId, userId: user.sub } },
    include: { task: { select: { status: true, createdBy: true } } },
  });

  if (!enrollment) return NextResponse.json({ error: "未订阅该活动" }, { status: 404 });
  if (enrollment.task.createdBy === user.sub) {
    return NextResponse.json({ error: "不能退订自己发布的活动" }, { status: 400 });
  }
  if (enrollment.task.status !== "PRELIMINARY") {
    return NextResponse.json({ error: "当前阶段不能退订" }, { status: 400 });
  }

  // Delete enrollment only — submissions and answers are kept
  await prisma.enrollment.delete({ where: { id: enrollment.id } });

  return NextResponse.json({ ok: true });
}
