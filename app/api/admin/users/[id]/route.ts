import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, hashPassword } from "@/lib/auth";
import { cascadeDeleteUsers } from "@/lib/deleteUser";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "无权限" }, { status: 403 });
  const { id } = await params;
  const { name, role, newPassword, canPublish } = await request.json();
  const data: Record<string, unknown> = {};
  if (name) data.name = name;
  if (role) data.role = role;
  if (canPublish !== undefined) data.canPublish = canPublish;
  const grantingPublish = canPublish === true;
  if (newPassword) {
    if (newPassword.length < 6) return NextResponse.json({ error: "密码至少6位" }, { status: 400 });
    data.passwordHash = await hashPassword(newPassword);
  }
  const updated = await prisma.user.update({ where: { id }, data, select: { id: true, email: true, name: true, role: true } });
  if (grantingPublish) {
    await prisma.notification.create({
      data: {
        userId: id,
        type: "PUBLISHER_GRANTED",
        title: "发布权限已授予",
        body: "管理员已为您授予发布权限，现在可以创建和发布活动。",
      },
    });
  }
  return NextResponse.json({ user: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "无权限" }, { status: 403 });
  const { id } = await params;
  if (id === user.sub) return NextResponse.json({ error: "不能删除自己" }, { status: 400 });
  await cascadeDeleteUsers([id]);
  return NextResponse.json({ ok: true });
}
