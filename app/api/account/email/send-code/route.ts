import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";
import { rateLimit, getClientIP } from "@/lib/rateLimit";
import { verifyCaptcha } from "@/lib/captcha";
import { issueCode } from "@/lib/emailVerification";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WINDOW_MS = 3600000; // 1 hour

export async function POST(request: Request) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const maxReqs = Number(process.env.RATE_LIMIT_SEND_CODE) || 20;
  const rl = rateLimit(`emailcode:${user.sub}:${getClientIP(request)}`, WINDOW_MS, maxReqs);
  if (!rl.ok) return NextResponse.json({ error: st(lang, "auth.tooManyRequests") }, { status: 429 });

  const { newEmail: rawNewEmail, captchaId, captchaText } = await request.json();

  if (!verifyCaptcha(captchaId, captchaText)) {
    return NextResponse.json({ error: st(lang, "api.captchaInvalid") }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });
  if (!dbUser) return NextResponse.json({ error: st(lang, "auth.userNotFound") }, { status: 404 });
  if (!dbUser.passwordHash) return NextResponse.json({ error: st(lang, "api.ssoPasswordUnavailable") }, { status: 400 });

  if (!process.env.SMTP_HOST) {
    return NextResponse.json({ error: st(lang, "api.smtpNotConfigured") }, { status: 503 });
  }

  try {
    if (rawNewEmail !== undefined && rawNewEmail !== null && String(rawNewEmail).trim() !== "") {
      // Change-email flow: send to the new address.
      const newEmail = String(rawNewEmail).trim().toLowerCase();
      if (!EMAIL_RE.test(newEmail) || newEmail.length > 254) {
        return NextResponse.json({ error: st(lang, "auth.invalidEmail") }, { status: 400 });
      }
      if (newEmail === dbUser.email) {
        return NextResponse.json({ error: st(lang, "api.emailUnchanged") }, { status: 400 });
      }
      const taken = await prisma.user.findUnique({ where: { email: newEmail } });
      if (taken) return NextResponse.json({ error: st(lang, "auth.emailExists") }, { status: 409 });
      await issueCode(newEmail, "change", dbUser.name, dbUser.language);
    } else {
      // Verify-current flow: send to the existing address.
      await issueCode(dbUser.email, "verify", dbUser.name, dbUser.language);
    }
  } catch (error) {
    console.error("Account email send-code error:", error);
    return NextResponse.json({ error: st(lang, "api.emailSendFailed") }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
