import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

// Returns public questions for a task (so students know what they'll be evaluated on)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 });

  const questions = await prisma.question.findMany({
    where: { taskId: id, split: "TRAIN" },
    orderBy: { orderIndex: "asc" },
    select: { id: true, content: true, answer: true, orderIndex: true },
  });

  return NextResponse.json({ questions });
}
