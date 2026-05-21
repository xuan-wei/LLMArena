import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function GET(request: Request) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const configs = await prisma.studentLLMConfig.findMany({
    where: { userId: user.sub },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    configs: configs.map((c) => ({
      ...c,
      apiKey: c.apiKey ? "***" + c.apiKey.slice(-4) : null,
    })),
  });
}

export async function POST(request: Request) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { name, apiBaseUrl, apiKey, models } = await request.json();
  if (!name) return NextResponse.json({ error: st(lang, "api.nameRequired") }, { status: 400 });
  if (!apiBaseUrl || !apiKey) return NextResponse.json({ error: st(lang, "api.apiBaseAndKeyRequired") }, { status: 400 });

  const config = await prisma.studentLLMConfig.create({
    data: { userId: user.sub, name, apiBaseUrl, apiKey, models: models ?? "" },
  });

  return NextResponse.json({ config }, { status: 201 });
}
