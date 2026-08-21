import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmailVerificationCode } from "@/lib/email";

export type CodePurpose = "register" | "verify" | "change";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

function genCode(): string {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

/**
 * Invalidate previous unused codes for (email, purpose), generate a fresh
 * 6-digit code, persist it, and email it. Mirrors the forgot-password flow.
 */
export async function issueCode(
  email: string,
  purpose: CodePurpose,
  name: string,
  language: unknown,
): Promise<void> {
  await prisma.emailVerificationCode.updateMany({
    where: { email, purpose, used: false },
    data: { used: true },
  });
  const code = genCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await prisma.emailVerificationCode.create({
    data: { email, purpose, code, expiresAt },
  });
  await sendEmailVerificationCode(email, name, code, language);
}

type ConsumeResult = { ok: true } | { ok: false; reason: "invalid" | "tooManyAttempts" };

/**
 * Validate a submitted code for (email, purpose). Increments the attempt
 * counter; after MAX_ATTEMPTS the code is burned. On success marks it used.
 */
export async function consumeCode(
  email: string,
  purpose: CodePurpose,
  code: string,
): Promise<ConsumeResult> {
  const record = await prisma.emailVerificationCode.findFirst({
    where: { email, purpose, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return { ok: false, reason: "invalid" };

  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.emailVerificationCode.update({ where: { id: record.id }, data: { used: true } });
    return { ok: false, reason: "tooManyAttempts" };
  }

  if (record.code !== code.trim()) {
    await prisma.emailVerificationCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, reason: "invalid" };
  }

  await prisma.emailVerificationCode.update({ where: { id: record.id }, data: { used: true } });
  return { ok: true };
}
