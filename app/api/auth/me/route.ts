import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { DEFAULT_LANGUAGE, tFor } from "@/lib/i18n";

export async function GET(request: Request) {
  const payload = getUser(request);
  if (!payload) {
    return NextResponse.json({ error: tFor(DEFAULT_LANGUAGE, "auth.notLoggedIn") }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, role: true, canPublish: true, language: true, createdAt: true },
  });

  if (!user) {
    return NextResponse.json({ error: tFor(DEFAULT_LANGUAGE, "auth.userNotFound") }, { status: 404 });
  }

  return NextResponse.json({ user });
}
