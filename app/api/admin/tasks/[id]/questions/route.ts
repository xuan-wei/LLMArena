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
  const questions = await prisma.question.findMany({
    where: { taskId: id },
    orderBy: { orderIndex: "asc" },
  });
  return NextResponse.json({ questions });
}

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
  const { content, answer, split, orderIndex } = await request.json();

  if (!content) {
    return NextResponse.json({ error: "题目内容不能为空" }, { status: 400 });
  }

  const count = await prisma.question.count({ where: { taskId: id } });
  const question = await prisma.question.create({
    data: {
      taskId: id,
      content,
      answer: answer || null,
      split: split ?? "UNUSED",
      orderIndex: orderIndex ?? count,
    },
  });

  return NextResponse.json({ question }, { status: 201 });
}
