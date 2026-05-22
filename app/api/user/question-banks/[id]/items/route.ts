import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { parseCSV } from "@/lib/csv";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  // Only own personal banks
  const bank = await prisma.questionBank.findFirst({
    where: { id, createdBy: user.sub, isSample: false },
  });
  if (!bank) return NextResponse.json({ error: st(lang, "api.bankNotFoundOrNoPermission") }, { status: 404 });

  const body = await request.json();
  const existing = await prisma.questionBankItem.count({ where: { bankId: id } });

  if (body.csv) {
    const rows = parseCSV(body.csv as string);
    const dataRows = rows[0]?.[0]?.toLowerCase() === "question" ? rows.slice(1) : rows;
    if (dataRows.length === 0) return NextResponse.json({ error: st(lang, "api.csvNoValidRows") }, { status: 400 });

    const items = dataRows
      .filter((row) => row[0]?.trim())
      .map((row, i) => ({
        bankId: id,
        content: row[0].trim(),
        answer: row[1]?.trim() || null,
        orderIndex: existing + i,
      }));

    if (items.length === 0) return NextResponse.json({ error: st(lang, "api.noValidQuestions") }, { status: 400 });
    await prisma.questionBankItem.createMany({ data: items });
    return NextResponse.json({ count: items.length }, { status: 201 });
  }

  // Bulk items array
  if (Array.isArray(body.items)) {
    const items = (body.items as { content: string; answer?: string }[])
      .filter((it) => it.content?.trim())
      .map((it, i) => ({
        bankId: id,
        content: it.content.trim(),
        answer: it.answer?.trim() || null,
        orderIndex: existing + i,
      }));
    if (items.length === 0) return NextResponse.json({ error: st(lang, "api.noValidQuestions") }, { status: 400 });
    await prisma.questionBankItem.createMany({ data: items });
    return NextResponse.json({ count: items.length }, { status: 201 });
  }

  // Single item
  const { content, answer } = body;
  if (!content?.trim()) return NextResponse.json({ error: st(lang, "api.questionContentRequired") }, { status: 400 });
  const item = await prisma.questionBankItem.create({
    data: { bankId: id, content: content.trim(), answer: answer?.trim() || null, orderIndex: existing },
  });
  return NextResponse.json({ item }, { status: 201 });
}
