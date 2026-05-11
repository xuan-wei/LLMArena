import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  // Allow reading both personal banks and sample banks
  const bank = await prisma.questionBank.findFirst({
    where: { id, OR: [{ createdBy: user.sub }, { isSample: true }] },
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
  if (!bank) return NextResponse.json({ error: "题库不存在" }, { status: 404 });
  return NextResponse.json({ bank });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const { name, description } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "名称不能为空" }, { status: 400 });

  // Only own personal banks
  const result = await prisma.questionBank.updateMany({
    where: { id, createdBy: user.sub, isSample: false },
    data: { name: name.trim(), description: description?.trim() ?? "" },
  });
  if (result.count === 0) return NextResponse.json({ error: "题库不存在或无权限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  // Only own personal banks
  const result = await prisma.questionBank.deleteMany({
    where: { id, createdBy: user.sub, isSample: false },
  });
  if (result.count === 0) return NextResponse.json({ error: "题库不存在或无权限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
