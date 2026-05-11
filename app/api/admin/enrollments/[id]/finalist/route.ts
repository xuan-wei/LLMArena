import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const { isFinalist } = await request.json();

  const enrollment = await prisma.enrollment.update({
    where: { id },
    data: { isFinalist, ...(isFinalist ? { trialRunsUsed: 0 } : {}) },
  });

  return NextResponse.json({ enrollment });
}
