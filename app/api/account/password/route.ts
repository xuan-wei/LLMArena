import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, verifyPassword, hashPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { currentPassword, newPassword } = await request.json();
  if (!currentPassword || !newPassword) return NextResponse.json({ error: "请填写当前密码和新密码" }, { status: 400 });
  if (newPassword.length < 6) return NextResponse.json({ error: "新密码至少6位" }, { status: 400 });
  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });
  if (!dbUser) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  if (!dbUser.passwordHash) return NextResponse.json({ error: "该账户通过机构 SSO 登录，无法修改密码" }, { status: 400 });
  const valid = await verifyPassword(currentPassword, dbUser.passwordHash);
  if (!valid) return NextResponse.json({ error: "当前密码错误" }, { status: 400 });
  await prisma.user.update({ where: { id: user.sub }, data: { passwordHash: await hashPassword(newPassword) } });
  return NextResponse.json({ ok: true });
}
