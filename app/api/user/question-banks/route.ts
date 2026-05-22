import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function GET(request: Request) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const [sampleBanks, personalBanks] = await Promise.all([
    prisma.questionBank.findMany({
      where: { isSample: true },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.questionBank.findMany({
      where: { isSample: false, createdBy: user.sub },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({ sampleBanks, personalBanks });
}

export async function POST(request: Request) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { name, description } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: st(lang, "api.nameRequired") }, { status: 400 });

  const bank = await prisma.questionBank.create({
    data: { name: name.trim(), description: description?.trim() ?? "", isSample: false, createdBy: user.sub },
  });
  return NextResponse.json({ bank }, { status: 201 });
}
