import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function POST(request: Request) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { bankId } = await request.json();
  if (!bankId) return NextResponse.json({ error: st(lang, "api.missingBankId") }, { status: 400 });

  const source = await prisma.questionBank.findFirst({
    where: { id: bankId, isSample: true },
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
  if (!source) return NextResponse.json({ error: st(lang, "api.sampleBankNotFound") }, { status: 404 });

  const newBank = await prisma.questionBank.create({
    data: {
      name: `${source.name}${st(lang, "api.importedFromSample")}`,
      description: source.description,
      isSample: false,
      createdBy: user.sub,
      items: {
        create: source.items.map((item, i) => ({
          content: item.content,
          answer: item.answer ?? "",
          orderIndex: i,
        })),
      },
    },
  });

  return NextResponse.json({ bank: newBank, count: source.items.length }, { status: 201 });
}
