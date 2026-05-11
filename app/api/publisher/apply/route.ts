import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFresh } from "@/lib/auth";
import { sendAdminNewApplicationEmail } from "@/lib/email";

export async function POST(request: Request) {
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  // Admins and existing publishers don't need to apply
  if (user.role === "ADMIN" || user.canPublish) {
    return NextResponse.json({ error: "已拥有发布权限" }, { status: 400 });
  }

  const { institution, homepage, purpose } = await request.json();
  if (!institution || !purpose) {
    return NextResponse.json({ error: "机构和申请用途不能为空" }, { status: 400 });
  }

  // Check for existing PENDING application
  const existing = await prisma.publisherApplication.findFirst({
    where: { userId: user.sub, status: "PENDING" },
  });
  if (existing) {
    return NextResponse.json({ error: "已有待审核的申请，请等待审核结果" }, { status: 409 });
  }

  const application = await prisma.publisherApplication.create({
    data: { userId: user.sub, institution, homepage: homepage || null, purpose },
  });

  // Notify all admins
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, email: true } });
  const applicant = await prisma.user.findUnique({ where: { id: user.sub }, select: { name: true } });
  if (admins.length > 0 && applicant) {
    await Promise.all([
      prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: "NEW_APPLICATION",
          title: "收到新的发布权限申请",
          body: `用户 ${applicant.name} 提交了发布权限申请，请前往管理控制台审批。`,
          refId: application.id,
        })),
      }),
      sendAdminNewApplicationEmail(admins.map((a) => a.email), applicant.name).catch(console.error),
    ]);
  }

  return NextResponse.json({ application }, { status: 201 });
}
