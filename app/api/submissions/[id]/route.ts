import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const lang = await getRequestLanguage(request);
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });

  const { id } = await params;
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      answers: {
        include: {
          question: {
            select: { id: true, content: true, split: true, orderIndex: true },
          },
        },
        orderBy: { question: { orderIndex: "asc" } },
      },
    },
  });

  if (!submission) return NextResponse.json({ error: st(lang, "api.notFound") }, { status: 404 });

  // Only owner or admin can view
  if (submission.userId !== user.sub && user.role !== "ADMIN") {
    return NextResponse.json({ error: st(lang, "api.noPermission") }, { status: 403 });
  }

  return NextResponse.json({ submission });
}
