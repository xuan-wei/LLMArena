import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFresh } from "@/lib/auth";
import { canManageTask } from "@/lib/permissions";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const submission = await prisma.submission.findUnique({
    where: { id },
    select: { taskId: true, status: true, task: { select: { createdBy: true } } },
  });
  if (!submission) return NextResponse.json({ error: "提交不存在" }, { status: 404 });
  if (!canManageTask(user, submission.task.createdBy)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  if (submission.status === "RUNNING") {
    return NextResponse.json({ error: "运行中的提交无法删除" }, { status: 400 });
  }

  await prisma.submission.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
