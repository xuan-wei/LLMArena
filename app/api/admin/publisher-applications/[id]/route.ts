import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { sendPublisherGrantedEmail, sendPublisherRejectedEmail } from "@/lib/email";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getUser(request);
  if (!isAdmin(user)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const application = await prisma.publisherApplication.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true, institution: true } },
      reviewer: { select: { name: true } },
    },
  });
  if (!application) return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  return NextResponse.json({ application });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getUser(request);
  if (!isAdmin(user)) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { id } = await params;
  const { action, rejectReason } = await request.json() as {
    action: "approve" | "reject";
    rejectReason?: string;
  };

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action 必须为 approve 或 reject" }, { status: 400 });
  }

  const application = await prisma.publisherApplication.findUnique({ where: { id } });
  if (!application) return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  if (application.status !== "PENDING") {
    return NextResponse.json({ error: "该申请已处理" }, { status: 409 });
  }

  const appUser = await prisma.user.findUnique({ where: { id: application.userId }, select: { email: true, name: true, language: true } });

  // Mark all admin notifications about this application as read (notification "ends")
  const markNotificationsRead = prisma.notification.updateMany({
    where: { refId: id, type: "NEW_APPLICATION", read: false },
    data: { read: true },
  });

  if (action === "approve") {
    await prisma.$transaction([
      prisma.publisherApplication.update({
        where: { id },
        data: { status: "APPROVED", reviewedAt: new Date(), reviewedBy: user!.sub},
      }),
      prisma.user.update({
        where: { id: application.userId },
        data: { canPublish: true },
      }),
      prisma.notification.create({
        data: {
          userId: application.userId,
          type: "PUBLISHER_GRANTED",
          title: appUser?.language === "zh" ? "发布权限已通过" : "Publisher access approved",
          body: appUser?.language === "zh" ? "您的发布权限申请已审批通过，现在可以创建和发布活动。" : "Your publisher access request has been approved. You can now create and publish activities.",
        },
      }),
      markNotificationsRead,
    ]);
    if (appUser) {
      sendPublisherGrantedEmail(appUser.email, appUser.name, appUser.language === "zh" ? "zh" : "en").catch(console.error);
    }
  } else {
    await prisma.$transaction([
      prisma.publisherApplication.update({
        where: { id },
        data: { status: "REJECTED", rejectReason: rejectReason || null, reviewedAt: new Date(), reviewedBy: user!.sub},
      }),
      prisma.notification.create({
        data: {
          userId: application.userId,
          type: "APPLICATION_REJECTED",
          title: appUser?.language === "zh" ? "发布权限申请未通过" : "Publisher access request rejected",
          body: appUser?.language === "zh"
            ? (rejectReason ? `申请未通过，原因：${rejectReason}` : "您的发布权限申请未通过审核。")
            : (rejectReason ? `Request rejected. Reason: ${rejectReason}` : "Your publisher access request was rejected."),
        },
      }),
      markNotificationsRead,
    ]);
    if (appUser) {
      sendPublisherRejectedEmail(appUser.email, appUser.name, rejectReason, appUser.language === "zh" ? "zh" : "en").catch(console.error);
    }
  }

  return NextResponse.json({ ok: true });
}
