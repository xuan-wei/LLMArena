import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function PUT(request: Request) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });
  const { name } = await request.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: st(lang, "api.nameRequired") }, { status: 400 });
  }
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length > 50) {
    return NextResponse.json({ error: st(lang, "api.nameRequired") }, { status: 400 });
  }
  await prisma.user.update({ where: { id: user.sub }, data: { name: trimmed } });
  return NextResponse.json({ ok: true });
}
