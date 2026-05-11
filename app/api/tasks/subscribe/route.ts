import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function POST(request: Request) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { code } = await request.json() as { code?: string };
  if (!code || !/^\d{6}$/.test(code.trim())) {
    return NextResponse.json({ error: "订阅码必须是6位数字" }, { status: 400 });
  }

  const task = await prisma.task.findUnique({ where: { subscribeCode: code.trim() } });
  if (!task) return NextResponse.json({ error: "订阅码无效" }, { status: 404 });
  if (!task.subscribeCodeEnabled) {
    return NextResponse.json({ error: "该活动的订阅码已停用" }, { status: 403 });
  }
  if (task.status === "DRAFT") {
    return NextResponse.json({ error: "该活动尚未开放订阅" }, { status: 403 });
  }

  // Creators don't need to subscribe
  if (task.createdBy === user.sub) {
    return NextResponse.json({ error: "这是你自己发布的活动，无需订阅" }, { status: 400 });
  }

  const existing = await prisma.enrollment.findUnique({
    where: { taskId_userId: { taskId: task.id, userId: user.sub } },
  });
  if (existing) return NextResponse.json({ error: "已订阅该活动" }, { status: 409 });

  const enrollment = await prisma.enrollment.create({
    data: { taskId: task.id, userId: user.sub },
  });

  return NextResponse.json({ enrollment, task: { id: task.id, title: task.title } }, { status: 201 });
}
