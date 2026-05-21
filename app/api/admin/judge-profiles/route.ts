import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { canPublishTasks } from "@/lib/permissions";
import { getRequestLanguage, st } from "@/lib/i18n/server";
import { defaultJudgeTemplate, objectiveTemplate, subjectiveTemplate } from "@/lib/i18n/templates";

export async function GET(request: Request) {
  const user = await getUserFresh(request);
  const lang = await getRequestLanguage(request);
  if (!canPublishTasks(user)) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }
  // Every user sees only their own profiles
  const where = { createdBy: user.sub };
  const profiles = await prisma.judgeProfile.findMany({
    where,
    include: {
      llmConfig: { select: { id: true, name: true } },
      studentLLMConfig: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ profiles });
}

export async function POST(request: Request) {
  const user = await getUserFresh(request);
  const lang = await getRequestLanguage(request);
  if (!canPublishTasks(user)) {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }

  const { name, llmConfigId, studentLLMConfigId, model, type, systemPrompt, enableThinking, thinkingBudget, temperature, maxTokens } = await request.json();
  if (!name) {
    return NextResponse.json({ error: st(lang, "api.nameRequired") }, { status: 400 });
  }

  const defaultPrompt = defaultJudgeTemplate(lang, type);

  const profile = await prisma.judgeProfile.create({
    data: {
      name,
      llmConfigId: llmConfigId || null,
      studentLLMConfigId: studentLLMConfigId || null,
      model: model || null,
      type: type || "SUBJECTIVE",
      systemPrompt: systemPrompt || defaultPrompt,
      enableThinking: enableThinking ?? true,
      thinkingBudget: thinkingBudget != null ? Number(thinkingBudget) : null,
      temperature: temperature != null ? Number(temperature) : null,
      maxTokens: maxTokens != null ? Number(maxTokens) : null,
      createdBy: user.sub,
    },
    include: {
      llmConfig: { select: { id: true, name: true } },
      studentLLMConfig: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ profile }, { status: 201 });
}

export async function GET_TEMPLATES() {
  return NextResponse.json({
    OBJECTIVE: objectiveTemplate("en"),
    SUBJECTIVE: subjectiveTemplate("en"),
  });
}
