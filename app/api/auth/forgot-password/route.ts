import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(request: Request) {
  const { email } = await request.json();
  if (!email) return NextResponse.json({ error: "请填写邮箱" }, { status: 400 });

  // Always return success to prevent email enumeration
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    // SSO-only user or not found — still return ok
    return NextResponse.json({ ok: true });
  }

  if (!process.env.SMTP_HOST) {
    return NextResponse.json(
      { error: "邮件服务未配置，请联系管理员" },
      { status: 503 },
    );
  }

  // Invalidate previous tokens
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  const origin = process.env.JACCOUNT_REDIRECT_URI
    ? new URL(process.env.JACCOUNT_REDIRECT_URI).origin
    : "http://localhost:3000";

  const resetLink = `${origin}/reset-password?token=${token}`;
  await sendPasswordResetEmail(user.email, user.name, resetLink);

  return NextResponse.json({ ok: true });
}
