import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { normalizeLanguage } from "@/lib/i18n";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function PATCH(request: Request) {
  const payload = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!payload) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (body.language !== "en" && body.language !== "zh") {
    return NextResponse.json({ error: st(lang, "api.invalidLanguage") }, { status: 400 });
  }

  const language = normalizeLanguage(body.language);
  const user = await prisma.user.update({
    where: { id: payload.sub },
    data: { language },
    select: { id: true, email: true, name: true, role: true, canPublish: true, language: true },
  });

  return NextResponse.json({ ok: true, user, message: st(language, "api.preferencesSaved") });
}
