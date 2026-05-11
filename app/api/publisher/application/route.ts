import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const application = await prisma.publisherApplication.findFirst({
    where: { userId: user.sub },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ application });
}
