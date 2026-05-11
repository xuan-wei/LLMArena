/**
 * One-time migration script for the open-platform refactor.
 * Run with: npx tsx prisma/migrate-open-platform.ts
 *
 * What it does:
 * 1. Sets Task.createdBy to the first ADMIN user for all tasks that don't have one
 * 2. Marks all existing JudgeProfiles (createdBy=null) as isDefault=true
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Find the first admin
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) {
    console.log("No ADMIN user found — skipping Task migration");
  } else {
    const { count } = await prisma.task.updateMany({
      where: { createdBy: null },
      data: { createdBy: admin.id },
    });
    console.log(`Updated ${count} tasks → createdBy = ${admin.email}`);
  }

  // 2. Mark all existing judge profiles as system defaults
  const { count: jpCount } = await prisma.judgeProfile.updateMany({
    where: { createdBy: null, isDefault: false },
    data: { isDefault: true },
  });
  console.log(`Marked ${jpCount} JudgeProfiles as isDefault=true`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
