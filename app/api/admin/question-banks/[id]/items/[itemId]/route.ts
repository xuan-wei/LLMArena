import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });

  const { id, itemId } = await params;
  const result = await prisma.questionBankItem.deleteMany({ where: { id: itemId, bankId: id } });
  if (result.count === 0) return NextResponse.json({ error: st(lang, "api.questionNotFound") }, { status: 404 });
  return NextResponse.json({ ok: true });
}
