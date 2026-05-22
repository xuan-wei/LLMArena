import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function GET(request: Request) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const application = await prisma.publisherApplication.findFirst({
    where: { userId: user.sub },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ application });
}
