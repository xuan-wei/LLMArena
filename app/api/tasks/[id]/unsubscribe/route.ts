import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id: taskId } = await params;

  const enrollment = await prisma.enrollment.findUnique({
    where: { taskId_userId: { taskId, userId: user.sub } },
    include: { task: { select: { status: true, createdBy: true } } },
  });

  if (!enrollment) return NextResponse.json({ error: st(lang, "api.enrollmentRequired") }, { status: 404 });
  if (enrollment.task.createdBy === user.sub) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 400 });
  }
  if (enrollment.task.status !== "PRELIMINARY" && enrollment.task.status !== "ENDED") {
    return NextResponse.json({ error: st(lang, "api.withdrawNotAllowed") }, { status: 400 });
  }

  await prisma.enrollment.delete({ where: { id: enrollment.id } });

  return NextResponse.json({ ok: true });
}
