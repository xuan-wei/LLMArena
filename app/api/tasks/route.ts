import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

export async function GET(request: Request) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  // Return tasks the user can see:
  //   1. Tasks they are enrolled in (subscribed), status != DRAFT
  //   2. Tasks they created (all statuses)
  //   3. Admins see all non-DRAFT tasks
  let where: object;
  if (isAdmin(user)) {
    where = {
      OR: [
        { status: { in: ["PRELIMINARY", "FINALS", "ENDED"] } },
        { createdBy: user.sub }, // admin's own tasks (including DRAFT)
      ],
    };
  } else {
    where = {
      OR: [
        // Subscribed tasks (enrolled)
        {
          status: { in: ["PRELIMINARY", "FINALS", "ENDED"] },
          enrollments: { some: { userId: user.sub } },
        },
        // Own tasks (any status)
        { createdBy: user.sub },
      ],
    };
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { questions: true, enrollments: true } },
      enrollments: {
        where: { userId: user.sub },
        select: { id: true },
      },
    },
  });

  const result = tasks.map(({ enrollments, ...task }) => ({
    ...task,
    isEnrolled: enrollments.length > 0,
  }));

  return NextResponse.json({ tasks: result });
}
