import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";
import { translateSystemText } from "@/lib/i18n";

export async function DELETE(request: Request) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });
  await prisma.notification.deleteMany({ where: { userId: user.sub } });
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.sub },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.notification.count({ where: { userId: user.sub, read: false } }),
  ]);

  return NextResponse.json({
    notifications: notifications.map((n) => ({
      ...n,
      title: translateSystemText(lang, n.title),
      body: translateSystemText(lang, n.body),
    })),
    unread,
  });
}
