import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signJWT } from "@/lib/auth";
import { sendWelcomeEmail } from "@/lib/email";
import { st } from "@/lib/i18n/server";
import { normalizeLanguage } from "@/lib/i18n";

export async function POST(request: Request) {
  let lang = "zh";
  try {
    const { email, name, password, language } = await request.json();
    lang = normalizeLanguage(language);

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: st(lang, "auth.registerRequired") },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: st(lang, "auth.passwordTooShort") },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: st(lang, "auth.emailExists") }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, name, passwordHash, language: lang },
    });

    const token = signJWT({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      canPublish: user.canPublish,
    });

    sendWelcomeEmail(user.email, user.name, user.language).catch(console.error);

    return NextResponse.json(
      { token, user: { id: user.id, email: user.email, name: user.name, role: user.role, canPublish: user.canPublish, language: user.language } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: st(lang, "auth.registerFailed") }, { status: 500 });
  }
}
