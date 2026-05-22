import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      // Only show public questions during competition
      questions: {
        where: { split: "TRAIN" },
        orderBy: { orderIndex: "asc" },
            select: { id: true, content: true, orderIndex: true },
      },
      adminStudentLLMConfig: { select: { id: true, name: true } },
      _count: { select: { enrollments: true } },
    },
  });

  if (!task) return NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 });
  return NextResponse.json({ task });
}
