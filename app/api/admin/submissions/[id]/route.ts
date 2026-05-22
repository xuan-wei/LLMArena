import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFresh } from "@/lib/auth";
import { canManageTask } from "@/lib/permissions";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const lang = await getRequestLanguage(request);
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const submission = await prisma.submission.findUnique({
    where: { id },
    select: { taskId: true, status: true, task: { select: { createdBy: true } } },
  });
  if (!submission) return NextResponse.json({ error: st(lang, "api.submissionNotFound") }, { status: 404 });
  if (!canManageTask(user, submission.task.createdBy)) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }
  if (submission.status === "RUNNING") {
    return NextResponse.json({ error: st(lang, "api.submissionRunningCannotDelete") }, { status: 400 });
  }

  await prisma.submission.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
