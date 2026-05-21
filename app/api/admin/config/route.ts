import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

const ALLOWED_KEYS = [
  "SYSTEM_LLM_BASE_URL",
  "SYSTEM_LLM_API_KEY",
  "SYSTEM_LLM_MODEL",
  "ALLOWED_MODELS",
  "welcome_email_enabled",
  "publisher_application_email_enabled",
  "publisher_application_email_recipients",
];

export async function GET(request: Request) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const configs = await prisma.systemConfig.findMany({
    where: { key: { in: ALLOWED_KEYS } },
  });

  const result: Record<string, string> = {};
  for (const c of configs) {
    result[c.key] = c.key.includes("API_KEY") ? "***" + c.value.slice(-4) : c.value;
  }

  return NextResponse.json({ config: result });
}

export async function PUT(request: Request) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { key, value } = await request.json();

  if (!ALLOWED_KEYS.includes(key)) {
    return NextResponse.json({ error: "无效的配置项" }, { status: 400 });
  }

  await prisma.systemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });

  return NextResponse.json({ ok: true });
}
