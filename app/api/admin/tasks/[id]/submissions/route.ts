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
  const lang = await getRequestLanguage(request);
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const _t = await prisma.task.findUnique({ where: { id }, select: { createdBy: true } });
  if (!_t) return NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 });
  if (!canManageTask(user, _t.createdBy)) return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  const url = new URL(request.url);
  const phase = url.searchParams.get("phase");
  if (!phase || !["PRELIMINARY", "FINALS"].includes(phase)) {
    return NextResponse.json({ error: st(lang, "api.invalidStage") }, { status: 400 });
  }

  const { count } = await prisma.submission.deleteMany({
    where: { taskId: id, phase: phase as "PRELIMINARY" | "FINALS" },
  });

  return NextResponse.json({ deleted: count });
}
