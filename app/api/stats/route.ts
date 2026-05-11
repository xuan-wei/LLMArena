import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { onlineTracker } from "@/lib/onlineTracker";

async function getStats() {
  const [visitStat, userCount] = await Promise.all([
    prisma.siteStat.findUnique({ where: { key: "visits" } }),
    prisma.user.count(),
  ]);
  return {
    visits: visitStat?.value ?? 0,
    users: userCount,
    online: onlineTracker.countOnline(),
  };
}

export async function GET() {
  return NextResponse.json(await getStats());
}

// Called by footer on every page load: increments visit counter + updates online tracker
// Called by footer: countVisit=true on page load, false on subsequent heartbeats
export async function POST(request: Request) {
  const { userId, countVisit } = await request.json().catch(() => ({}));

  if (userId) onlineTracker.touch(userId);

  if (countVisit) {
    await prisma.siteStat.upsert({
      where: { key: "visits" },
      update: { value: { increment: 1 } },
      create: { key: "visits", value: 1 },
    });
  }

  return NextResponse.json(await getStats());
}
