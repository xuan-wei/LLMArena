import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { isAdmin, canPublishTasks } from "@/lib/permissions";

export async function GET(request: Request) {
  const user = await getUserFresh(request);
  if (!user || !canPublishTasks(user)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  // Admin sees system configs (createdBy=null); publishers see only their own
  const where = isAdmin(user) ? { createdBy: null } : { createdBy: user.sub };
  const configs = await prisma.lLMConfig.findMany({ where, orderBy: { createdAt: "asc" } });
  return NextResponse.json({
    configs: configs.map((c) => ({
      ...c,
      apiKey: "***" + c.apiKey.slice(-4),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getUserFresh(request);
  if (!user || !canPublishTasks(user)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const { name, baseUrl, apiKey, models } = await request.json();
  if (!name || !apiKey) {
    return NextResponse.json({ error: "名称和 API Key 不能为空" }, { status: 400 });
  }
  const config = await prisma.lLMConfig.create({
    data: {
      name,
      baseUrl: baseUrl || "https://api.openai.com/v1",
      apiKey,
      models: models || "",
      // null for admin (system-wide); user ID for publishers (private)
      createdBy: isAdmin(user) ? null : user.sub,
    },
  });
  return NextResponse.json(
    { config: { ...config, apiKey: "***" + config.apiKey.slice(-4) } },
    { status: 201 }
  );
}
