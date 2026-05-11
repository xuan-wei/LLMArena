import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { submissionQueue } from "@/lib/queue";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;

  // Check status and reset inside a transaction to prevent concurrent retries from
  // double-enqueuing the same submission.
  const result = await prisma.$transaction(async (tx) => {
    const sub = await tx.submission.findUnique({ where: { id }, select: { status: true } });
    if (!sub) return "NOT_FOUND";
    if (sub.status !== "FAILED" && sub.status !== "SYSERR") return "INVALID_STATUS";
    await tx.answer.deleteMany({ where: { submissionId: id } });
    await tx.submission.update({
      where: { id },
      data: { status: "PENDING", errorMessage: null, publicScore: null, privateScore: null, finalScore: null, completedAt: null },
    });
    return "OK";
  });

  if (result === "NOT_FOUND") return NextResponse.json({ error: "不存在" }, { status: 404 });
  if (result === "INVALID_STATUS") return NextResponse.json({ error: "只能重跑失败的提交" }, { status: 400 });

  submissionQueue.enqueue(id);

  return NextResponse.json({ ok: true });
}
