import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const bank = await prisma.questionBank.findFirst({
    where: { id, isSample: true },
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
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const { name, description } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "名称不能为空" }, { status: 400 });

  const bank = await prisma.questionBank.updateMany({
    where: { id, isSample: true },
    data: { name: name.trim(), description: description?.trim() ?? "" },
  });
  if (bank.count === 0) return NextResponse.json({ error: "题库不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const result = await prisma.questionBank.deleteMany({ where: { id, isSample: true } });
  if (result.count === 0) return NextResponse.json({ error: "题库不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
