import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signJWT } from "@/lib/auth";
import { st } from "@/lib/i18n/server";
import { normalizeLanguage } from "@/lib/i18n";
import { rateLimit, getClientIP } from "@/lib/rateLimit";

const WINDOW_MS = 900000; // 15 minutes

export async function POST(request: Request) {
  let lang = "zh";
  try {
    const ip = getClientIP(request);
    const maxReqs = Number(process.env.RATE_LIMIT_LOGIN) || 60;
    const rl = rateLimit(`login:${ip}`, WINDOW_MS, maxReqs);
    if (!rl.ok) {
      return NextResponse.json({ error: st(lang, "auth.tooManyRequests") }, { status: 429 });
    }

    const { email, password, language } = await request.json();
    lang = normalizeLanguage(language);

    if (!email || !password) {
      return NextResponse.json({ error: st(lang, "auth.emailRequired") }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: st(lang, "auth.invalidCredentials") }, { status: 401 });
    }

    if (!user.passwordHash) {
      return NextResponse.json({ error: st(lang, "auth.ssoOnly") }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: st(lang, "auth.invalidCredentials") }, { status: 401 });
    }

    const token = signJWT({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      canPublish: user.canPublish,
    });

    return NextResponse.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, canPublish: user.canPublish, language: user.language },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: st(lang, "auth.loginFailed") }, { status: 500 });
  }
}
