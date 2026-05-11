import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signJWT } from "@/lib/auth";
import { sendWelcomeEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const { email, name, password } = await request.json();

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: "邮箱、姓名和密码不能为空" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "密码至少6位" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, name, passwordHash },
    });

    const token = signJWT({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      canPublish: user.canPublish,
    });

    sendWelcomeEmail(user.email, user.name).catch(console.error);

    return NextResponse.json(
      { token, user: { id: user.id, email: user.email, name: user.name, role: user.role, canPublish: user.canPublish } },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "注册失败" }, { status: 500 });
  }
}
