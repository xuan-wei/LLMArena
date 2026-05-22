import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFresh } from "@/lib/auth";
import { canManageTask } from "@/lib/permissions";
import { parseCSV } from "@/lib/csv";
import { getRequestLanguage, st } from "@/lib/i18n/server";

type QSplit = "TRAIN" | "TEST" | "UNUSED";

function parseSplit(raw?: string): QSplit {
  const v = raw?.trim().toLowerCase();
  if (v === "train") return "TRAIN";
  if (v === "test") return "TEST";
  return "UNUSED";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const lang = await getRequestLanguage(request);
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const _t = await prisma.task.findUnique({ where: { id }, select: { createdBy: true } });
  if (!_t) return NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 });
  if (!canManageTask(user, _t.createdBy)) return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  const body = await request.json();

  const existing = await prisma.question.count({ where: { taskId: id } });
  let questions: { taskId: string; content: string; answer: string | null; split: QSplit; orderIndex: number }[];

  if (body.bankId) {
    // Import from question bank — all imported as UNUSED
    const bankId = body.bankId as string;
    const itemIds = body.itemIds as string[] | undefined;

    const bank = await prisma.questionBank.findFirst({
      where: {
        id: bankId,
        OR: [{ isSample: true }, { createdBy: user.sub }],
      },
      include: {
        items: {
          where: itemIds ? { id: { in: itemIds } } : undefined,
          orderBy: { orderIndex: "asc" },
        },
      },
    });
    if (!bank) return NextResponse.json({ error: st(lang, "api.bankNotFoundOrNoPermission") }, { status: 404 });
    if (bank.items.length === 0) return NextResponse.json({ error: st(lang, "api.noQuestionsToImport") }, { status: 400 });

    questions = bank.items.map((item, i) => ({
      taskId: id,
      content: item.content,
      answer: item.answer,
      split: "UNUSED",
      orderIndex: existing + i,
    }));
  } else if (body.csv) {
    // CSV format: question, answer (optional), split (train/test/unused, optional)
    const rows = parseCSV(body.csv as string);
    const dataRows = rows[0]?.[0]?.toLowerCase() === "question" ? rows.slice(1) : rows;

    if (dataRows.length === 0) {
      return NextResponse.json({ error: st(lang, "api.csvNoValidRows") }, { status: 400 });
    }

    questions = dataRows
      .filter((row) => row[0]?.trim())
      .map((row, i) => ({
        taskId: id,
        content: row[0].trim(),
        answer: row[1]?.trim() || null,
        split: parseSplit(row[2]),
        orderIndex: existing + i,
      }));
  } else if (body.text) {
    // Plain text, split on last "|"
    const lines = (body.text as string)
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    if (lines.length === 0) {
      return NextResponse.json({ error: st(lang, "api.noValidQuestions") }, { status: 400 });
    }

    questions = lines.map((line: string, i: number) => {
      const pipeIdx = line.lastIndexOf("|");
      if (pipeIdx === -1) {
        return { taskId: id, content: line, answer: null, split: "UNUSED" as QSplit, orderIndex: existing + i };
      }
      return {
        taskId: id,
        content: line.slice(0, pipeIdx).trim(),
        answer: line.slice(pipeIdx + 1).trim() || null,
        split: "UNUSED" as QSplit,
        orderIndex: existing + i,
      };
    });
  } else {
    return NextResponse.json({ error: st(lang, "api.provideTextCsvOrBankId") }, { status: 400 });
  }

  if (questions.length === 0) {
    return NextResponse.json({ error: st(lang, "api.noValidQuestions") }, { status: 400 });
  }

  await prisma.question.createMany({ data: questions });
  return NextResponse.json({ count: questions.length }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const lang = await getRequestLanguage(request);
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id }, select: { createdBy: true } });
  if (!task) return NextResponse.json({ error: st(lang, "api.taskNotFound") }, { status: 404 });
  if (!canManageTask(user, task.createdBy)) return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });

  const { mode } = await request.json().catch(() => ({ mode: "all" }));
  // mode: "unused" | "noAnswers" | "all"

  let qids: string[];
  if (mode === "unused") {
    const qs = await prisma.question.findMany({ where: { taskId: id, split: "UNUSED" }, select: { id: true } });
    qids = qs.map((q) => q.id);
  } else if (mode === "noAnswers") {
    const qs = await prisma.question.findMany({
      where: { taskId: id },
      select: { id: true, _count: { select: { answers: true } } },
    });
    qids = qs.filter((q) => q._count.answers === 0).map((q) => q.id);
  } else {
    const qs = await prisma.question.findMany({ where: { taskId: id }, select: { id: true } });
    qids = qs.map((q) => q.id);
  }

  if (qids.length === 0) return NextResponse.json({ count: 0 });

  await prisma.answer.deleteMany({ where: { questionId: { in: qids } } });
  await prisma.question.deleteMany({ where: { id: { in: qids } } });

  return NextResponse.json({ count: qids.length });
}
