import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const OBJECTIVE_PROMPT = `你是一个严格的评判者。请根据题目和参考答案，判断学生答案是否正确。

题目：{{question}}
参考答案：{{expected}}
学生答案：{{output}}

如果学生答案正确（意思相同即可，不要求字面完全一致），返回 1；否则返回 0。
只返回一个 JSON 对象，格式为：{"score": 0或1, "reason": "简要说明"}`;

const SUBJECTIVE_PROMPT = `你是一个公正的评分者。请根据题目和参考答案（如有），对学生回答的质量进行评分。

题目：{{question}}
参考答案：{{expected}}（如为"无"则为开放题，请根据质量评分）
学生答案：{{output}}

请给出 0 到 1 之间的分数，反映回答的准确性、完整性和表达质量。
只返回一个 JSON 对象，格式为：{"score": 0到1的小数, "reason": "评分理由"}`;

async function main() {
  const adminHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@arena.edu" },
    update: {},
    create: {
      email: "admin@arena.edu",
      name: "管理员",
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });
  console.log("Admin created:", admin.email);

  const studentHash = await bcrypt.hash("student123", 10);
  const student = await prisma.user.upsert({
    where: { email: "student@arena.edu" },
    update: {},
    create: {
      email: "student@arena.edu",
      name: "示例学生",
      passwordHash: studentHash,
      role: "STUDENT",
    },
  });
  console.log("Student created:", student.email);

  // Default judge profiles (no LLM config required yet)
  const existing = await prisma.judgeProfile.findFirst({ where: { name: "主观题评分器" } });
  if (!existing) {
    await prisma.judgeProfile.createMany({
      data: [
        {
          name: "主观题评分器",
          type: "SUBJECTIVE",
          systemPrompt: SUBJECTIVE_PROMPT,
        },
        {
          name: "客观题评分器",
          type: "OBJECTIVE",
          systemPrompt: OBJECTIVE_PROMPT,
        },
      ],
    });
    console.log("Default judge profiles created");
  }

  console.log("\n=== 账号信息 ===");
  console.log("管理员: admin@arena.edu / admin123");
  console.log("学生:   student@arena.edu / student123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
