import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function POST(request: Request) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { bankId } = await request.json();
  if (!bankId) return NextResponse.json({ error: "缺少 bankId" }, { status: 400 });

  const source = await prisma.questionBank.findFirst({
    where: { id: bankId, isSample: true },
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
  if (!source) return NextResponse.json({ error: "样例题库不存在" }, { status: 404 });

  const newBank = await prisma.questionBank.create({
    data: {
      name: `${source.name}【来自样例题库】`,
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
