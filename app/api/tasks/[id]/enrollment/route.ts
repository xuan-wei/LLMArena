import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { ParticipationMode } from "@prisma/client";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const enrollment = await prisma.enrollment.findUnique({
    where: { taskId_userId: { taskId: id, userId: user.sub } },
    include: { studentLLMConfig: { select: { id: true, name: true, models: true } } },
  });

  if (enrollment) {
    return NextResponse.json({
      enrollment: {
        ...enrollment,
        difyApiKey: enrollment.difyApiKey ? "***" + enrollment.difyApiKey.slice(-4) : null,
        cozeApiKey: enrollment.cozeApiKey ? "***" + enrollment.cozeApiKey.slice(-4) : null,
      },
    });
  }
  return NextResponse.json({ enrollment: null });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const [task, existing] = await Promise.all([
    prisma.task.findUnique({ where: { id } }),
    prisma.enrollment.findUnique({ where: { taskId_userId: { taskId: id, userId: user.sub } } }),
  ]);
  if (!task) return NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 });
  if (task.status !== "PRELIMINARY") return NextResponse.json({ error: st(lang, "api.preliminaryOnlyEnroll") }, { status: 400 });
  if (existing) return NextResponse.json({ error: st(lang, "api.alreadyEnrolled") }, { status: 409 });

  const mode = task.adminLLMEnabled ? "ADMIN_LLM" : "OPENAI_COMPATIBLE";
  const enrollment = await prisma.enrollment.create({ data: { taskId: id, userId: user.sub, mode } });
  return NextResponse.json({ enrollment }, { status: 201 });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const [enrollment, task] = await Promise.all([
    prisma.enrollment.findUnique({ where: { taskId_userId: { taskId: id, userId: user.sub } } }),
    prisma.task.findUnique({ where: { id } }),
  ]);
  if (!enrollment) return NextResponse.json({ error: st(lang, "api.enrollmentRequired") }, { status: 404 });
  if (!task) return NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 });

  // Admin LLM tasks: mode locked, but student can still set their own system prompt
  if (task.adminLLMEnabled) {
    const body = await request.json();
    const updated = await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        mode: "ADMIN_LLM",
        prompt: body.prompt ?? null,
      },
    });
    return NextResponse.json({ enrollment: updated });
  }

  const body = await request.json();
  const { mode, studentLLMConfigId, model, prompt, enableThinking, thinkingBudget, temperature, maxTokens, difyEndpoint, difyApiKey, cozeEndpoint, cozeApiKey, cozeBotId } = body;

  if (!mode) return NextResponse.json({ error: lang === "zh" ? "接入方式不能为空" : "Connection mode is required" }, { status: 400 });
  if (thinkingBudget != null && Number(thinkingBudget) > 10000) {
    return NextResponse.json({ error: lang === "zh" ? "thinkingBudget 不能超过 10000" : "thinkingBudget cannot exceed 10000" }, { status: 400 });
  }

  if (studentLLMConfigId) {
    const cfg = await prisma.studentLLMConfig.findUnique({
      where: { id: studentLLMConfigId },
      select: { userId: true },
    });
    if (!cfg || cfg.userId !== user.sub) {
      return NextResponse.json({ error: st(lang, "api.selectLLMAccount") }, { status: 400 });
    }
  }

  const resolvedDifyKey = difyApiKey && !difyApiKey.startsWith("***") ? difyApiKey : enrollment.difyApiKey;
  const resolvedCozeKey = cozeApiKey && !cozeApiKey.startsWith("***") ? cozeApiKey : enrollment.cozeApiKey;

  // Normalize endpoints: strip query strings, trailing slashes, and known path suffixes
  const normalizeDify = (url: string) => url.replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/\/v1\/chat-messages$/, "").replace(/\/v1$/, "");
  const normalizeCoze = (url: string) => url.replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/\/v3\/chat$/, "").replace(/\/v3$/, "");

  const updated = await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      mode: mode as ParticipationMode,
      // Always persist all fields regardless of current mode so switching modes preserves config
      studentLLMConfigId: studentLLMConfigId ?? null,
      model: model ?? null,
      prompt: prompt ?? null,
      enableThinking: enableThinking ?? false,
      thinkingBudget: thinkingBudget != null ? Number(thinkingBudget) : null,
      temperature: temperature != null ? Number(temperature) : null,
      maxTokens: maxTokens != null ? Number(maxTokens) : null,
      difyEndpoint: difyEndpoint ? normalizeDify(difyEndpoint) : null,
      difyApiKey: resolvedDifyKey,
      cozeEndpoint: cozeEndpoint ? normalizeCoze(cozeEndpoint) : null,
      cozeApiKey: resolvedCozeKey,
      cozeBotId: cozeBotId ?? null,
    },
  });

  return NextResponse.json({ enrollment: updated });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  const lang = await getRequestLanguage(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 });
  if (task.status !== "PRELIMINARY" && task.status !== "ENDED") return NextResponse.json({ error: st(lang, "api.withdrawNotAllowed") }, { status: 400 });

  await prisma.enrollment.deleteMany({ where: { taskId: id, userId: user.sub } });
  return NextResponse.json({ ok: true });
}
