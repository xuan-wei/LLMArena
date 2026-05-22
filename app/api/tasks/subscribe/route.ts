import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function POST(request: Request) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { code } = await request.json() as { code?: string };
  if (!code || !/^\d{6}$/.test(code.trim())) {
    return NextResponse.json({ error: st(lang, "api.subscribeCodeMustBe6Digits") }, { status: 400 });
  }

  const task = await prisma.task.findUnique({ where: { subscribeCode: code.trim() } });
  if (!task) return NextResponse.json({ error: st(lang, "api.subscribeCodeInvalid") }, { status: 404 });
  if (!task.subscribeCodeEnabled) {
    return NextResponse.json({ error: st(lang, "api.subscribeCodeDisabled") }, { status: 403 });
  }
  if (task.status === "DRAFT") {
    return NextResponse.json({ error: st(lang, "api.eventNotOpenForSubscription") }, { status: 403 });
  }

  // Creators don't need to subscribe
  if (task.createdBy === user.sub) {
    return NextResponse.json({ error: st(lang, "api.cannotSubscribeOwnEvent") }, { status: 400 });
  }

  const existing = await prisma.enrollment.findUnique({
    where: { taskId_userId: { taskId: task.id, userId: user.sub } },
  });
  if (existing) return NextResponse.json({ error: st(lang, "api.alreadySubscribed") }, { status: 409 });

  const enrollment = await prisma.enrollment.create({
    data: { taskId: task.id, userId: user.sub },
  });

  return NextResponse.json({ enrollment, task: { id: task.id, title: task.title } }, { status: 201 });
}
