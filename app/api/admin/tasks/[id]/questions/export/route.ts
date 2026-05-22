import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { canManageTask } from "@/lib/permissions";
import { getRequestLanguage, st } from "@/lib/i18n/server";

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const lang = await getRequestLanguage(request);
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, select: { createdBy: true, title: true } });
  if (!task) return NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 });
  if (!canManageTask(user, task.createdBy)) return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });

  const questions = await prisma.question.findMany({
    where: { taskId: id },
    orderBy: { orderIndex: "asc" },
  });

  const rows = [
    "question,answer",
    ...questions.map((q) =>
      [csvEscape(q.content), csvEscape(q.answer ?? "")].join(",")
    ),
  ];

  const csv = "\uFEFF" + rows.join("\r\n");
  const filename = `questions_${task.title.replace(/[^\w\u4e00-\u9fa5]/g, "_")}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="questions.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
