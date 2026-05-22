import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

// POST: toggle isFinal for a submission
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;

  const submission = await prisma.submission.findUnique({ where: { id } });
  if (!submission) return NextResponse.json({ error: st(lang, "api.submissionNotFound") }, { status: 404 });
  if (submission.userId !== user.sub) return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  if (submission.status !== "COMPLETED") {
    return NextResponse.json({ error: st(lang, "api.onlyCompletedCanBeSelected") }, { status: 400 });
  }

  const isCurrentlyFinal = submission.isFinal;

  // Unset all other finals for this user+task, then toggle this one
  await prisma.submission.updateMany({
    where: { userId: user.sub, taskId: submission.taskId },
    data: { isFinal: false },
  });

  if (!isCurrentlyFinal) {
    await prisma.submission.update({ where: { id }, data: { isFinal: true } });
  }

  return NextResponse.json({ isFinal: !isCurrentlyFinal });
}
