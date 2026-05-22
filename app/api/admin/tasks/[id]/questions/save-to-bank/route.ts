import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getUserFresh } from "@/lib/auth";
import { canManageTask } from "@/lib/permissions";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function POST(
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

  const body = await request.json() as {
    bankId?: string;       // existing bank id
    bankName?: string;     // new bank name (create new)
    questionIds?: string[]; // specific questions; omit = all
  };

  let bankId: string;

  if (body.bankId) {
    // Verify access — own personal bank or admin sample bank
    const bank = await prisma.questionBank.findFirst({
      where: {
        id: body.bankId,
        OR: [
          { createdBy: user.sub },
          ...(user.role === "ADMIN" ? [{ isSample: true }] : []),
        ],
      },
    });
    if (!bank) return NextResponse.json({ error: st(lang, "api.bankNotFoundOrNoPermission") }, { status: 404 });
    bankId = bank.id;
  } else if (body.bankName?.trim()) {
    // Create new personal bank
    const bank = await prisma.questionBank.create({
      data: {
        name: body.bankName.trim(),
        isSample: false,
        createdBy: user.sub,
      },
    });
    bankId = bank.id;
  } else {
    return NextResponse.json({ error: st(lang, "api.provideBankIdOrName") }, { status: 400 });
  }

  const questions = await prisma.question.findMany({
    where: {
      taskId: id,
      ...(body.questionIds ? { id: { in: body.questionIds } } : {}),
    },
    orderBy: { orderIndex: "asc" },
  });

  if (questions.length === 0) return NextResponse.json({ error: st(lang, "api.noQuestionsToSave") }, { status: 400 });

  const existing = await prisma.questionBankItem.count({ where: { bankId } });
  await prisma.questionBankItem.createMany({
    data: questions.map((q, i) => ({
      bankId,
      content: q.content,
      answer: q.answer,
      orderIndex: existing + i,
    })),
  });

  return NextResponse.json({ count: questions.length, bankId }, { status: 201 });
}
