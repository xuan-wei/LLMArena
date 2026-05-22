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
  const enrollments = await prisma.enrollment.findMany({
    where: { taskId: id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      _count: { select: { submissions: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ enrollments });
}
