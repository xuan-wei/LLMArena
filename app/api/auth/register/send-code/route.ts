import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { st } from "@/lib/i18n/server";
import { normalizeLanguage } from "@/lib/i18n";
import { rateLimit, getClientIP } from "@/lib/rateLimit";
import { verifyCaptcha } from "@/lib/captcha";
import { issueCode } from "@/lib/emailVerification";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WINDOW_MS = 3600000; // 1 hour

export async function POST(request: Request) {
  let lang = "zh";
  try {
    const ip = getClientIP(request);
    const maxReqs = Number(process.env.RATE_LIMIT_SEND_CODE) || 20;
    const rl = rateLimit(`sendcode:${ip}`, WINDOW_MS, maxReqs);
    if (!rl.ok) {
      return NextResponse.json({ error: st(lang, "auth.tooManyRequests") }, { status: 429 });
    }

    const { email: rawEmail, name: rawName, captchaId, captchaText, language } = await request.json();
    lang = normalizeLanguage(language);

    if (!verifyCaptcha(captchaId, captchaText)) {
      return NextResponse.json({ error: st(lang, "api.captchaInvalid") }, { status: 400 });
    }

    const email = String(rawEmail ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return NextResponse.json({ error: st(lang, "auth.invalidEmail") }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: st(lang, "auth.emailExists") }, { status: 409 });
    }

    if (!process.env.SMTP_HOST) {
      return NextResponse.json({ error: st(lang, "api.smtpNotConfigured") }, { status: 503 });
    }

    const name = String(rawName ?? "").trim().replace(/\s+/g, " ") || email;
    await issueCode(email, "register", name, lang);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Register send-code error:", error);
    return NextResponse.json({ error: st(lang, "auth.registerFailed") }, { status: 500 });
  }
}
