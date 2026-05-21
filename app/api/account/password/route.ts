import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, verifyPassword, hashPassword } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function POST(request: Request) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });
  const { currentPassword, newPassword } = await request.json();
  if (!currentPassword || !newPassword) return NextResponse.json({ error: st(lang, "api.currentAndNewPasswordRequired") }, { status: 400 });
  if (newPassword.length < 6) return NextResponse.json({ error: st(lang, "api.newPasswordTooShort") }, { status: 400 });
  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });
  if (!dbUser) return NextResponse.json({ error: st(lang, "auth.userNotFound") }, { status: 404 });
  if (!dbUser.passwordHash) return NextResponse.json({ error: st(lang, "api.ssoPasswordUnavailable") }, { status: 400 });
  const valid = await verifyPassword(currentPassword, dbUser.passwordHash);
  if (!valid) return NextResponse.json({ error: st(lang, "api.currentPasswordIncorrect") }, { status: 400 });
  await prisma.user.update({ where: { id: user.sub }, data: { passwordHash: await hashPassword(newPassword) } });
  return NextResponse.json({ ok: true });
}
