import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { evaluateAnswer } from "@/lib/evaluation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const { questionId, output } = await request.json();
  if (!questionId || typeof output !== "string") {
    return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  }

  // Verify enrollment
  const enrollment = await prisma.enrollment.findUnique({
    where: { taskId_userId: { taskId: id, userId: user.sub } },
  });
  if (!enrollment) return NextResponse.json({ error: "尚未报名" }, { status: 403 });

  const question = await prisma.question.findFirst({
    where: { id: questionId, taskId: id, split: "TRAIN" },
  });
  if (!question) return NextResponse.json({ error: "题目不存在" }, { status: 404 });

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      judgeProfile: { include: { llmConfig: true, studentLLMConfig: true } },
    },
  });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  try {
    const result = await evaluateAnswer(output, question, task);
    return NextResponse.json({ score: result.score, reason: result.reason ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "评估失败" }, { status: 500 });
  }
}
