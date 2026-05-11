import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { canManageTask } from "@/lib/permissions";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const _t = await prisma.task.findUnique({ where: { id }, select: { createdBy: true } });
  if (!_t) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (!canManageTask(user, _t.createdBy)) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const submissions = await prisma.submission.findMany({
    where: { taskId: id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      _count: { select: { answers: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ submissions });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const _t = await prisma.task.findUnique({ where: { id }, select: { createdBy: true } });
  if (!_t) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (!canManageTask(user, _t.createdBy)) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const url = new URL(request.url);
  const phase = url.searchParams.get("phase");
  if (!phase || !["PRELIMINARY", "FINALS"].includes(phase)) {
    return NextResponse.json({ error: "请指定有效的阶段 (PRELIMINARY 或 FINALS)" }, { status: 400 });
  }

  const { count } = await prisma.submission.deleteMany({
    where: { taskId: id, phase: phase as "PRELIMINARY" | "FINALS" },
  });

  return NextResponse.json({ deleted: count });
}
