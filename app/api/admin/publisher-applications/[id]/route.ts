import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { sendPublisherGrantedEmail, sendPublisherRejectedEmail } from "@/lib/email";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!isAdmin(user)) return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });

  const { id } = await params;
  const application = await prisma.publisherApplication.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true, institution: true } },
      reviewer: { select: { name: true } },
    },
  });
  if (!application) return NextResponse.json({ error: st(lang, "api.applicationNotFound") }, { status: 404 });
  return NextResponse.json({ application });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!isAdmin(user)) return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });

  const { id } = await params;
  const { action, rejectReason } = await request.json() as {
    action: "approve" | "reject";
    rejectReason?: string;
  };

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: st(lang, "api.actionMustBeApproveOrReject") }, { status: 400 });
  }

  const application = await prisma.publisherApplication.findUnique({ where: { id } });
  if (!application) return NextResponse.json({ error: st(lang, "api.applicationNotFound") }, { status: 404 });
  if (application.status !== "PENDING") {
    return NextResponse.json({ error: st(lang, "api.applicationAlreadyProcessed") }, { status: 409 });
  }

  const appUser = await prisma.user.findUnique({ where: { id: application.userId }, select: { email: true, name: true, language: true } });
  const userLang = appUser?.language === "zh" ? "zh" : "en";

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
          title: st(userLang, "api.publisherApprovedTitle"),
          body: st(userLang, "api.publisherApprovedBody"),
        },
      }),
      markNotificationsRead,
    ]);
    if (appUser) {
      sendPublisherGrantedEmail(appUser.email, appUser.name, userLang).catch(console.error);
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
          title: st(userLang, "api.publisherRejectedTitle"),
          body: rejectReason
            ? st(userLang, "api.publisherRejectedWithReason", { reason: rejectReason })
            : st(userLang, "api.publisherRejectedBody"),
        },
      }),
      markNotificationsRead,
    ]);
    if (appUser) {
      sendPublisherRejectedEmail(appUser.email, appUser.name, rejectReason, userLang).catch(console.error);
    }
  }

  return NextResponse.json({ ok: true });
}
