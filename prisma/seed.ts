import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { objectiveTemplate, subjectiveTemplate } from "../lib/i18n/templates";

const prisma = new PrismaClient();

const OBJECTIVE_PROMPT = objectiveTemplate("en");
const SUBJECTIVE_PROMPT = subjectiveTemplate("en");

async function main() {
  const adminHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@arena.edu" },
    update: {},
    create: {
      email: "admin@arena.edu",
      name: "Admin",
      passwordHash: adminHash,
      role: "ADMIN",
      language: "en",
    },
  });
  console.log("Admin created:", admin.email);

  const studentHash = await bcrypt.hash("student123", 10);
  const student = await prisma.user.upsert({
    where: { email: "student@arena.edu" },
    update: {},
    create: {
      email: "student@arena.edu",
      name: "Sample Student",
      passwordHash: studentHash,
      role: "STUDENT",
      language: "en",
    },
  });
  console.log("Student created:", student.email);

  // Default judge profiles (no LLM config required yet)
  const existing = await prisma.judgeProfile.findFirst({ where: { name: "Subjective Judge" } });
  if (!existing) {
    await prisma.judgeProfile.createMany({
      data: [
        {
          name: "Subjective Judge",
          type: "SUBJECTIVE",
          systemPrompt: SUBJECTIVE_PROMPT,
        },
        {
          name: "Objective Judge",
          type: "OBJECTIVE",
          systemPrompt: OBJECTIVE_PROMPT,
        },
      ],
    });
    console.log("Default judge profiles created");
  }

  console.log("\n=== 账号信息 ===");
  console.log("Admin:   admin@arena.edu / admin123");
  console.log("Student: student@arena.edu / student123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
