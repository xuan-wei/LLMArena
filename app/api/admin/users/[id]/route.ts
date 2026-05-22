import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, hashPassword } from "@/lib/auth";
import { cascadeDeleteUsers } from "@/lib/deleteUser";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  const { id } = await params;
  const { name, role, newPassword, canPublish } = await request.json();
  const data: Record<string, unknown> = {};
  if (name) data.name = name;
  if (role) data.role = role;
  if (canPublish !== undefined) data.canPublish = canPublish;
  const grantingPublish = canPublish === true;
  if (newPassword) {
    if (newPassword.length < 6) return NextResponse.json({ error: st(lang, "auth.passwordTooShort") }, { status: 400 });
    data.passwordHash = await hashPassword(newPassword);
  }
  const updated = await prisma.user.update({ where: { id }, data, select: { id: true, email: true, name: true, role: true } });
  if (grantingPublish) {
    const targetUser = await prisma.user.findUnique({ where: { id }, select: { language: true } });
    const targetLang = targetUser?.language === "zh" ? "zh" : "en";
    await prisma.notification.create({
      data: {
        userId: id,
        type: "PUBLISHER_GRANTED",
        title: st(targetLang, "api.publisherGrantedTitle"),
        body: st(targetLang, "api.publisherGrantedBody"),
      },
    });
  }
  return NextResponse.json({ user: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  const { id } = await params;
  if (id === user.sub) return NextResponse.json({ error: st(lang, "api.cannotDeleteSelf") }, { status: 400 });
  await cascadeDeleteUsers([id]);
  return NextResponse.json({ ok: true });
}
