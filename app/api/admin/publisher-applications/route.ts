import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

export async function GET(request: Request) {
  const user = getUser(request);
  if (!isAdmin(user)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status"); // PENDING | APPROVED | REJECTED | null (all)

  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
  const skip = (page - 1) * pageSize;

  const where = status ? { status: status as "PENDING" | "APPROVED" | "REJECTED" } : undefined;

  const [applications, total] = await Promise.all([
    prisma.publisherApplication.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, name: true, institution: true } },
        reviewer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.publisherApplication.count({ where }),
  ]);

  return NextResponse.json({ applications, total, page, pageSize });
}
