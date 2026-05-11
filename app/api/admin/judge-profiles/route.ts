import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { canPublishTasks } from "@/lib/permissions";

const OBJECTIVE_TEMPLATE = `你是一个严格的评判者。请根据题目和参考答案，判断学生答案是否正确。

题目：{{question}}
参考答案：{{expected}}
学生答案：{{output}}

如果学生答案正确（意思相同即可，不要求字面完全一致），返回 1；否则返回 0。
只返回一个 JSON 对象，格式为：{"score": 0或1, "reason": "简要说明"}`;

const SUBJECTIVE_TEMPLATE = `你是一个公正的评分者。请根据题目和参考答案（如有），对学生回答的质量进行评分。

题目：{{question}}
参考答案：{{expected}}（如为"无"则为开放题，请根据质量评分）
学生答案：{{output}}

请给出 0 到 1 之间的分数，反映回答的准确性、完整性和表达质量。
只返回一个 JSON 对象，格式为：{"score": 0到1的小数, "reason": "评分理由"}`;

export async function GET(request: Request) {
  const user = await getUserFresh(request);
  if (!canPublishTasks(user)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
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
  if (!canPublishTasks(user)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { name, llmConfigId, studentLLMConfigId, model, type, systemPrompt, enableThinking, thinkingBudget, temperature, maxTokens } = await request.json();
  if (!name) {
    return NextResponse.json({ error: "名称不能为空" }, { status: 400 });
  }

  const defaultPrompt =
    type === "OBJECTIVE" ? OBJECTIVE_TEMPLATE : SUBJECTIVE_TEMPLATE;

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
    OBJECTIVE: OBJECTIVE_TEMPLATE,
    SUBJECTIVE: SUBJECTIVE_TEMPLATE,
  });
}
