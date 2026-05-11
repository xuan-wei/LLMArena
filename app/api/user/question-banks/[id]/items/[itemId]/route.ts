import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id, itemId } = await params;
  // Ensure the bank belongs to the user (personal only)
  const bank = await prisma.questionBank.findFirst({
    where: { id, createdBy: user.sub, isSample: false },
  });
  if (!bank) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const result = await prisma.questionBankItem.deleteMany({ where: { id: itemId, bankId: id } });
  if (result.count === 0) return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
