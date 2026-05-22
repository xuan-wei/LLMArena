import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFresh } from "@/lib/auth";
import { sendAdminNewApplicationEmail } from "@/lib/email";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function POST(request: Request) {
  const lang = await getRequestLanguage(request);
  const user = await getUserFresh(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  // Admins and existing publishers don't need to apply
  if (user.role === "ADMIN" || user.canPublish) {
    return NextResponse.json({ error: st(lang, "api.alreadyHasPublishPermission") }, { status: 400 });
  }

  const { institution, homepage, purpose } = await request.json();
  if (!institution || !purpose) {
    return NextResponse.json({ error: st(lang, "api.institutionAndPurposeRequired") }, { status: 400 });
  }

  // Check for existing PENDING application
  const existing = await prisma.publisherApplication.findFirst({
    where: { userId: user.sub, status: "PENDING" },
  });
  if (existing) {
    return NextResponse.json({ error: st(lang, "api.pendingApplicationExists") }, { status: 409 });
  }

  const application = await prisma.publisherApplication.create({
    data: { userId: user.sub, institution, homepage: homepage || null, purpose },
  });

  // Notify all admins in-app; email only the configured recipients.
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, email: true, language: true } });
  const applicant = await prisma.user.findUnique({ where: { id: user.sub }, select: { name: true } });
  if (admins.length > 0 && applicant) {
    const emailConfigs = await prisma.systemConfig.findMany({
      where: {
        key: {
          in: ["publisher_application_email_enabled", "publisher_application_email_recipients"],
        },
      },
    });
    const configMap = Object.fromEntries(emailConfigs.map((c) => [c.key, c.value]));
    const emailEnabled = configMap.publisher_application_email_enabled === "true";
    let recipientIds: string[] = [];
    try {
      const parsed = JSON.parse(configMap.publisher_application_email_recipients || "[]");
      recipientIds = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
      recipientIds = [];
    }
    const emailAdmins = emailEnabled ? admins.filter((admin) => recipientIds.includes(admin.id)) : [];

    await Promise.all([
      prisma.notification.createMany({
        data: admins.map((a) => {
          const aLang = a.language === "zh" ? "zh" : "en";
          return {
            userId: a.id,
            type: "NEW_APPLICATION",
            title: st(aLang, "api.newApplicationTitle"),
            body: st(aLang, "api.newApplicationBody", { name: applicant.name }),
            refId: application.id,
          };
        }),
      }),
      emailAdmins.length > 0
        ? Promise.all(
            Object.entries(emailAdmins.reduce<Record<string, string[]>>((acc, admin) => {
              const language = admin.language === "zh" ? "zh" : "en";
              acc[language] ??= [];
              acc[language].push(admin.email);
              return acc;
            }, {})).map(([language, emails]) => sendAdminNewApplicationEmail(emails, applicant.name, { institution, homepage, purpose }, language as "en" | "zh")),
          ).catch(console.error)
        : Promise.resolve(),
    ]);
  }

  return NextResponse.json({ application }, { status: 201 });
}
