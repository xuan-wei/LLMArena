import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { evaluateAnswer } from "@/lib/evaluation";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const { questionId, output } = await request.json();
  if (!questionId || typeof output !== "string") {
    return NextResponse.json({ error: st(lang, "api.missingParams") }, { status: 400 });
  }

  // Verify enrollment
  const enrollment = await prisma.enrollment.findUnique({
    where: { taskId_userId: { taskId: id, userId: user.sub } },
  });
  if (!enrollment) return NextResponse.json({ error: st(lang, "api.notEnrolled") }, { status: 403 });

  const question = await prisma.question.findFirst({
    where: { id: questionId, taskId: id, split: "TRAIN" },
  });
  if (!question) return NextResponse.json({ error: st(lang, "api.questionNotFound") }, { status: 404 });

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      judgeProfile: { include: { llmConfig: true, studentLLMConfig: true } },
    },
  });
  if (!task) return NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 });

  try {
    const result = await evaluateAnswer(output, question, task);
    return NextResponse.json({ score: result.score, reason: result.reason ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : st(lang, "api.evaluationFailed") }, { status: 500 });
  }
}
