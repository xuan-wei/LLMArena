import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { canManageTask } from "@/lib/permissions";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function GET(
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
  const lang = await getRequestLanguage(request);
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const _t = await prisma.task.findUnique({ where: { id }, select: { createdBy: true } });
  if (!_t) return NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 });
  if (!canManageTask(user, _t.createdBy)) return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  const { content, answer, split, orderIndex } = await request.json();

  if (!content) {
    return NextResponse.json({ error: st(lang, "api.questionContentRequired") }, { status: 400 });
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
