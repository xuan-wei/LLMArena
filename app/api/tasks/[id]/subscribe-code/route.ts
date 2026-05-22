import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { canManageTask } from "@/lib/permissions";
import { getRequestLanguage, st } from "@/lib/i18n/server";

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST — generate a new subscribe code
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const lang = await getRequestLanguage(request);
  const user = await getUserFresh(request);
  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id }, select: { id: true, createdBy: true } });
  if (!task) return NextResponse.json({ error: st(lang, "api.eventNotFound") }, { status: 404 });
  if (!canManageTask(user, task.createdBy)) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }

  // Ensure uniqueness
  let code: string;
  let attempts = 0;
  do {
    code = generateCode();
    attempts++;
    if (attempts > 20) return NextResponse.json({ error: st(lang, "api.generateFailed") }, { status: 500 });
  } while (await prisma.task.findUnique({ where: { subscribeCode: code } }));

  const updated = await prisma.task.update({
    where: { id },
    data: { subscribeCode: code, subscribeCodeEnabled: true },
    select: { subscribeCode: true, subscribeCodeEnabled: true },
  });

  return NextResponse.json(updated);
}

// PATCH — enable or disable the subscribe code
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const lang = await getRequestLanguage(request);
  const user = await getUserFresh(request);
  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id }, select: { id: true, createdBy: true } });
  if (!task) return NextResponse.json({ error: st(lang, "api.eventNotFound") }, { status: 404 });
  if (!canManageTask(user, task.createdBy)) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }

  const { enabled } = await request.json() as { enabled: boolean };
  const updated = await prisma.task.update({
    where: { id },
    data: { subscribeCodeEnabled: enabled },
    select: { subscribeCode: true, subscribeCodeEnabled: true },
  });

  return NextResponse.json(updated);
}
