import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { cascadeDeleteUsers } from "@/lib/deleteUser";

export async function GET(request: Request) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "无权限" }, { status: 403 });
  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, name: true, role: true, canPublish: true, createdAt: true,
      institution: true, institutionId: true,
      _count: { select: { enrollments: true, submissions: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users });
}

export async function PATCH(request: Request) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { ids, action, value } = await request.json() as {
    ids: string[];
    action: "setRole" | "setCanPublish";
    value: string | boolean;
  };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "请提供用户ID列表" }, { status: 400 });
  }

  if (action === "setRole") {
    if (value !== "ADMIN" && value !== "STUDENT") {
      return NextResponse.json({ error: "角色值无效" }, { status: 400 });
    }
    const filtered = ids.filter((id) => id !== user.sub);
    await prisma.user.updateMany({ where: { id: { in: filtered } }, data: { role: value } });
    return NextResponse.json({ updated: filtered.length });
  }

  if (action === "setCanPublish") {
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { canPublish: !!value } });
    if (value === true) {
      await prisma.notification.createMany({
        data: ids.map((uid) => ({
          userId: uid,
          type: "PUBLISHER_GRANTED",
          title: "发布权限已授予",
          body: "管理员已为您授予发布权限，现在可以创建和发布活动。",
        })),
      });
    }
    return NextResponse.json({ updated: ids.length });
  }

  return NextResponse.json({ error: "无效的操作" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "无权限" }, { status: 403 });
  const { ids } = await request.json() as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: "请提供用户ID列表" }, { status: 400 });
  // Prevent self-deletion
  const filtered = ids.filter((id) => id !== user.sub);
  await cascadeDeleteUsers(filtered);
  return NextResponse.json({ deleted: filtered.length });
}
