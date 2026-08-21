import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUser, signJWT } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";
import { consumeCode } from "@/lib/emailVerification";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { code, newEmail: rawNewEmail } = await request.json();
  if (!code) return NextResponse.json({ error: st(lang, "api.codeRequired") }, { status: 400 });

  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });
  if (!dbUser) return NextResponse.json({ error: st(lang, "auth.userNotFound") }, { status: 404 });

  const isChange = rawNewEmail !== undefined && rawNewEmail !== null && String(rawNewEmail).trim() !== "";
  const targetEmail = isChange ? String(rawNewEmail).trim().toLowerCase() : dbUser.email;
  const purpose = isChange ? "change" : "verify";

  if (isChange && (!EMAIL_RE.test(targetEmail) || targetEmail.length > 254)) {
    return NextResponse.json({ error: st(lang, "auth.invalidEmail") }, { status: 400 });
  }

  const result = await consumeCode(targetEmail, purpose, String(code));
  if (!result.ok) {
    const key = result.reason === "tooManyAttempts" ? "api.tooManyAttempts" : "api.codeInvalidOrExpired";
    return NextResponse.json({ error: st(lang, key) }, { status: 400 });
  }

  let updated;
  try {
    updated = await prisma.user.update({
      where: { id: dbUser.id },
      data: isChange ? { email: targetEmail, emailVerified: true } : { emailVerified: true },
      select: { id: true, email: true, name: true, role: true, canPublish: true, language: true, emailVerified: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: st(lang, "auth.emailExists") }, { status: 409 });
    }
    throw e;
  }

  // Re-issue a token carrying the fresh email/emailVerified so the session updates.
  const token = signJWT({
    sub: updated.id,
    email: updated.email,
    role: updated.role,
    name: updated.name,
    canPublish: updated.canPublish,
    emailVerified: updated.emailVerified,
  });

  return NextResponse.json({ ok: true, token, user: updated });
}
