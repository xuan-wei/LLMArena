import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { normalizeLanguage } from "@/lib/i18n";
import { st } from "@/lib/i18n/server";

export async function POST(request: Request) {
  const { token, newPassword, language } = await request.json();
  const lang = normalizeLanguage(language);
  if (!token || !newPassword) {
    return NextResponse.json({ error: lang === "zh" ? "参数缺失" : "Missing parameters" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: st(lang, "auth.passwordTooShort") }, { status: 400 });
  }

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.used || record.expiresAt < new Date()) {
    return NextResponse.json({ error: lang === "zh" ? "链接已失效或已使用，请重新申请" : "This link has expired or has already been used. Please request a new one." }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { used: true } }),
  ]);

  return NextResponse.json({ ok: true });
}
