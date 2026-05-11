import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const { token, newPassword } = await request.json();
  if (!token || !newPassword) {
    return NextResponse.json({ error: "参数缺失" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "密码至少6位" }, { status: 400 });
  }

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.used || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "链接已失效或已使用，请重新申请" }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { used: true } }),
  ]);

  return NextResponse.json({ ok: true });
}
