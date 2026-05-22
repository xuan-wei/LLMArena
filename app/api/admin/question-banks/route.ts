import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function GET(request: Request) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });

  const banks = await prisma.questionBank.findMany({
    where: { isSample: true },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ banks });
}

export async function POST(request: Request) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });

  const { name, description } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: st(lang, "api.nameRequired") }, { status: 400 });

  const bank = await prisma.questionBank.create({
    data: { name: name.trim(), description: description?.trim() ?? "", isSample: true, createdBy: user.sub },
  });
  return NextResponse.json({ bank }, { status: 201 });
}
