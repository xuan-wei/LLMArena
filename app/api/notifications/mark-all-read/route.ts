import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function POST(request: Request) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  await prisma.notification.updateMany({
    where: { userId: user.sub, read: false },
    data: { read: true },
  });

  return NextResponse.json({ ok: true });
}
