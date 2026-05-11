import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

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
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { name, apiBaseUrl, apiKey, models } = await request.json();
  if (!name) return NextResponse.json({ error: "名称不能为空" }, { status: 400 });
  if (!apiBaseUrl || !apiKey) return NextResponse.json({ error: "API Base URL 和 Key 不能为空" }, { status: 400 });

  const config = await prisma.studentLLMConfig.create({
    data: { userId: user.sub, name, apiBaseUrl, apiKey, models: models ?? "" },
  });

  return NextResponse.json({ config }, { status: 201 });
}
