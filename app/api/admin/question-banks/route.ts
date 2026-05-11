import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "无权限" }, { status: 403 });

  const banks = await prisma.questionBank.findMany({
    where: { isSample: true },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ banks });
}

export async function POST(request: Request) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { name, description } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "名称不能为空" }, { status: 400 });

  const bank = await prisma.questionBank.create({
    data: { name: name.trim(), description: description?.trim() ?? "", isSample: true, createdBy: user.sub },
  });
  return NextResponse.json({ bank }, { status: 201 });
}
