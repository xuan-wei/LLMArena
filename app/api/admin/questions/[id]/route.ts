import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const { content, answer, split, orderIndex } = await request.json();

  const question = await prisma.question.update({
    where: { id },
    data: {
      ...(content !== undefined && { content }),
      ...(answer !== undefined && { answer: answer || null }),
      ...(split !== undefined && { split }),
      ...(orderIndex !== undefined && { orderIndex }),
    },
  });

  return NextResponse.json({ question });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  // Delete answers first to avoid foreign key constraint errors
  await prisma.answer.deleteMany({ where: { questionId: id } });
  await prisma.question.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
