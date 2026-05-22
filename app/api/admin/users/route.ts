import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { cascadeDeleteUsers } from "@/lib/deleteUser";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function GET(request: Request) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
  const q = url.searchParams.get("q")?.trim() || undefined;
  const role = url.searchParams.get("role") as "ADMIN" | "STUDENT" | null;
  const canPublish = url.searchParams.get("canPublish");
  const institution = url.searchParams.get("institution") || undefined;
  const sort = url.searchParams.get("sort") || "createdAt";
  const order = url.searchParams.get("order") === "asc" ? "asc" as const : "desc" as const;

  const where: Prisma.UserWhereInput = {};
  if (q) {
    where.OR = [
      { email: { contains: q } },
      { name: { contains: q } },
      { institutionId: { contains: q } },
    ];
  }
  if (role === "ADMIN" || role === "STUDENT") where.role = role;
  if (canPublish === "true") where.canPublish = true;
  if (canPublish === "false") where.canPublish = false;
  if (institution) where.institution = institution;

  const allowedSorts = ["createdAt", "name", "email", "role"];
  const orderBy = allowedSorts.includes(sort) ? { [sort]: order } : { createdAt: order };

  const [users, total, institutionRows] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, email: true, name: true, role: true, canPublish: true, createdAt: true,
        institution: true, institutionId: true,
        _count: { select: { enrollments: true, submissions: true } },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
    prisma.user.findMany({
      where: { institution: { not: null } },
      select: { institution: true },
      distinct: ["institution"],
    }),
  ]);

  return NextResponse.json({
    users,
    total,
    page,
    pageSize,
    institutions: institutionRows.map((i) => i.institution),
  });
}

export async function PATCH(request: Request) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });

  const { ids, action, value } = await request.json() as {
    ids: string[];
    action: "setRole" | "setCanPublish";
    value: string | boolean;
  };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: st(lang, "api.provideUserIds") }, { status: 400 });
  }

  if (action === "setRole") {
    if (value !== "ADMIN" && value !== "STUDENT") {
      return NextResponse.json({ error: st(lang, "api.invalidRole") }, { status: 400 });
    }
    const filtered = ids.filter((id) => id !== user.sub);
    await prisma.user.updateMany({ where: { id: { in: filtered } }, data: { role: value } });
    return NextResponse.json({ updated: filtered.length });
  }

  if (action === "setCanPublish") {
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { canPublish: !!value } });
    if (value === true) {
      const targetUsers = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, language: true } });
      await prisma.notification.createMany({
        data: targetUsers.map((u) => {
          const uLang = u.language === "zh" ? "zh" : "en";
          return {
            userId: u.id,
            type: "PUBLISHER_GRANTED",
            title: st(uLang, "api.publisherGrantedTitle"),
            body: st(uLang, "api.publisherGrantedBody"),
          };
        }),
      });
    }
    return NextResponse.json({ updated: ids.length });
  }

  return NextResponse.json({ error: st(lang, "api.invalidAction") }, { status: 400 });
}

export async function DELETE(request: Request) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  const { ids } = await request.json() as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: st(lang, "api.provideUserIds") }, { status: 400 });
  // Prevent self-deletion
  const filtered = ids.filter((id) => id !== user.sub);
  await cascadeDeleteUsers(filtered);
  return NextResponse.json({ deleted: filtered.length });
}
