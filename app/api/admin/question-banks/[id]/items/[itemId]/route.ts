import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id, itemId } = await params;
  const result = await prisma.questionBankItem.deleteMany({ where: { id: itemId, bankId: id } });
  if (result.count === 0) return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
