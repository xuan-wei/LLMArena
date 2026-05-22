import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import crypto from "crypto";
import { normalizeLanguage } from "@/lib/i18n";
import { st } from "@/lib/i18n/server";

export async function POST(request: Request) {
  const { email, language } = await request.json();
  const lang = normalizeLanguage(language);
  if (!email) return NextResponse.json({ error: st(lang, "auth.emailRequired") }, { status: 400 });

  // Always return success to prevent email enumeration
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    // SSO-only user or not found — still return ok
    return NextResponse.json({ ok: true });
  }

  if (!process.env.SMTP_HOST) {
    return NextResponse.json(
      { error: st(lang, "api.smtpNotConfigured") },
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
  await sendPasswordResetEmail(user.email, user.name, resetLink, user.language);

  return NextResponse.json({ ok: true });
}
