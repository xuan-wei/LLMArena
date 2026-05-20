import { prisma } from "@/lib/prisma";
import { type Prisma } from "@prisma/client";
import { callChatbot, type ChatbotConfig } from "@/lib/chatbot";
import { evaluateAnswer } from "@/lib/evaluation";
import { llmSemaphore } from "./llmSemaphore";
import type { JobProgress } from "./index";

type EnrollmentWithConfig = Prisma.EnrollmentGetPayload<{ include: { studentLLMConfig: true } }>;
type ProgressCallback = (progress: Partial<JobProgress>) => void;

export async function runSubmissionWorker(
  submissionId: string,
  onProgress: ProgressCallback = () => {}
) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      task: {
        include: {
          judgeProfile: { include: { llmConfig: true, studentLLMConfig: true } },
          adminStudentLLMConfig: true,
        },
      },
    },
  });

  if (!submission) throw new Error("Submission not found");

  const enrollment: EnrollmentWithConfig | null = submission.enrollmentId
    ? await prisma.enrollment.findUnique({
        where: { id: submission.enrollmentId },
        include: { studentLLMConfig: true },
      })
    : null;

  if (!enrollment) {
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "FAILED", errorMessage: "找不到报名记录" },
    });
    return;
  }

  let chatbotConfig: ChatbotConfig;

  if (submission.task.adminLLMEnabled) {
    const cfg = submission.task.adminStudentLLMConfig;
    if (!cfg || !cfg.apiBaseUrl || !cfg.apiKey) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { status: "FAILED", errorMessage: "管理员尚未完成接入配置，请联系管理员" },
      });
      return;
    }
    if (!submission.task.adminModel) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { status: "FAILED", errorMessage: "管理员未选择模型，请联系管理员" },
      });
      return;
    }
    chatbotConfig = {
      mode: "OPENAI_COMPATIBLE",
      systemPrompt: enrollment.prompt,
      apiBaseUrl: cfg.apiBaseUrl,
      apiKey: cfg.apiKey,
      apiModel: submission.task.adminModel,
      enableThinking: submission.task.adminEnableThinking,
      thinkingBudget: submission.task.adminThinkingBudget,
      temperature: submission.task.adminTemperature,
      maxTokens: submission.task.adminMaxTokens,
    };
  } else if (enrollment.mode === "OPENAI_COMPATIBLE") {
    const cfg = enrollment.studentLLMConfig;
    if (!cfg || !cfg.apiBaseUrl || !cfg.apiKey) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { status: "FAILED", errorMessage: "未配置 LLM API，请在 Chatbot 配置中选择 LLM 账号" },
      });
      return;
    }
    if (!enrollment.model) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { status: "FAILED", errorMessage: "未选择模型，请在 Chatbot 配置中选择模型" },
      });
      return;
    }
    chatbotConfig = {
      mode: "OPENAI_COMPATIBLE",
      systemPrompt: enrollment.prompt,
      apiBaseUrl: cfg.apiBaseUrl,
      apiKey: cfg.apiKey,
      apiModel: enrollment.model,
      enableThinking: enrollment.enableThinking,
      thinkingBudget: enrollment.thinkingBudget,
      temperature: enrollment.temperature,
      maxTokens: enrollment.maxTokens,
    };
  } else if (enrollment.mode === "DIFY") {
    if (!enrollment.difyEndpoint || !enrollment.difyApiKey) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { status: "FAILED", errorMessage: "Dify 配置不完整，请在 Chatbot 配置中填写" },
      });
      return;
    }
    chatbotConfig = {
      mode: "DIFY",
      difyEndpoint: enrollment.difyEndpoint,
      difyApiKey: enrollment.difyApiKey,
    };
  } else {
    if (!enrollment.cozeEndpoint || !enrollment.cozeApiKey || !enrollment.cozeBotId) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { status: "FAILED", errorMessage: "Coze 配置不完整，请在 Chatbot 配置中填写" },
      });
      return;
    }
    chatbotConfig = {
      mode: "COZE",
      cozeEndpoint: enrollment.cozeEndpoint,
      cozeApiKey: enrollment.cozeApiKey,
      cozeBotId: enrollment.cozeBotId,
    };
  }

  const questions = await prisma.question.findMany({
    where: { taskId: submission.taskId, split: { not: "UNUSED" } },
    orderBy: { orderIndex: "asc" },
  });

  if (questions.length === 0) {
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "COMPLETED", publicScore: 0, privateScore: 0, finalScore: 0, completedAt: new Date() },
    });
    return;
  }

  // Derive a stable key for the LLM account being used.
  // Submissions that share the same LLM key share the same concurrency pool;
  // submissions using different LLMs are completely independent.
  let llmKey: string;
  if (submission.task.adminLLMEnabled) {
    llmKey = `admin:${submission.task.adminStudentLLMConfigId ?? submission.taskId}`;
  } else if (enrollment.mode === "OPENAI_COMPATIBLE") {
    llmKey = `student:${enrollment.studentLLMConfigId ?? "unknown"}`;
  } else if (enrollment.mode === "DIFY") {
    llmKey = `dify:${enrollment.difyEndpoint}`;
  } else {
    llmKey = `coze:${enrollment.cozeBotId}`;
  }

  // Judge uses its own key so eval calls don't compete with generation calls.
  const judgeKey = submission.task.judgeProfile
    ? `judge:${submission.task.judgeProfile.id}`
    : "judge:none";

  // Atomically claim the submission — bail if another worker already started it.
  const claimed = await prisma.submission.updateMany({
    where: { id: submissionId, status: "PENDING" },
    data: { status: "RUNNING" },
  });
  if (claimed.count === 0) return;

  onProgress({ total: questions.length, completed: 0 });

  type QResult = { output: string; thinking: string; rawInput: string; genError: string | null; score: number | null; reason: string | null };
  const results: (QResult | undefined)[] = new Array(questions.length);
  let completedCount = 0;

  await Promise.allSettled(
    questions.map(async (q, i) => {
      // Yield to the event loop so other callbacks (including HTTP) can run.
      await new Promise<void>((r) => setImmediate(r));

      // Step 1: generate
      await llmSemaphore.acquire(llmKey);
      onProgress({ currentQuestion: q.content.slice(0, 50) });
      let output = "", thinking = "", rawInput = "", genError: string | null = null;
      try {
        const result = await callChatbot(chatbotConfig, q.content, 180000);
        output = result.output;
        thinking = result.thinking;
        rawInput = result.rawInput;
      } catch (error) {
        const baseMsg = error instanceof Error ? error.message : "Error";
        const diag = chatbotConfig.mode === "OPENAI_COMPATIBLE"
          ? ` [model=${chatbotConfig.apiModel}, base=${chatbotConfig.apiBaseUrl}]`
          : ` [mode=${chatbotConfig.mode}]`;
        genError = baseMsg + diag;
      } finally {
        llmSemaphore.release(llmKey);
      }

      // Step 2: evaluate immediately after generation
      let score: number | null = null, reason: string | null = null;
      if (!genError) {
        await new Promise<void>((r) => setImmediate(r));
        await llmSemaphore.acquire(judgeKey);
        try {
          const evalResult = await evaluateAnswer(output, q, submission.task);
          score = evalResult.score;
          reason = evalResult.reason ?? null;
        } finally {
          llmSemaphore.release(judgeKey);
        }
      }

      results[i] = { output, thinking, rawInput, genError, score: genError ? 0 : score, reason };
      completedCount++;
      onProgress({ completed: completedCount });
    })
  );

  onProgress({ completed: questions.length, phase: "done" });

  const completedResults = results.filter((r): r is QResult => r !== undefined);
  const allGenFailed = completedResults.length > 0 && completedResults.every((r) => r.genError !== null);

  await prisma.answer.createMany({
    data: questions.flatMap((q, i) => {
      const r = results[i];
      if (!r) return [];
      return [{
        submissionId,
        questionId: q.id,
        rawInput: r.rawInput || null,
        rawThinking: r.thinking || null,
        rawOutput: r.genError !== null ? `[调用失败] ${r.genError}` : r.output,
        score: r.score,
        judgeReason: r.genError !== null ? null : (r.reason || null),
      }];
    }),
  });

  const trainScores = questions.flatMap((q, i) => {
    const r = results[i];
    if (!r || q.split !== "TRAIN" || r.score === null) return [];
    return [r.score];
  });
  const testScores = questions.flatMap((q, i) => {
    const r = results[i];
    if (!r || q.split !== "TEST" || r.score === null) return [];
    return [r.score];
  });
  const avg = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
  const trainAvg = avg(trainScores);

  if (allGenFailed) {
    const errMsg = completedResults.find((r) => r.genError)?.genError ?? "LLM 调用失败";
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: "SYSERR",
        errorMessage: errMsg,
        publicScore: trainAvg,
        privateScore: testScores.length > 0 ? avg(testScores) : trainAvg,
        finalScore: testScores.length > 0 ? avg(testScores) : trainAvg,
        completedAt: new Date(),
      },
    });
    return;
  }

  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      status: "COMPLETED",
      publicScore: trainAvg,
      privateScore: testScores.length > 0 ? avg(testScores) : trainAvg,
      finalScore: testScores.length > 0 ? avg(testScores) : trainAvg,
      completedAt: new Date(),
    },
  });

  // Auto-designate best submission as isFinal
  const allCompleted = await prisma.submission.findMany({
    where: {
      taskId: submission.taskId,
      userId: submission.userId,
      phase: submission.phase,
      status: "COMPLETED",
    },
    select: { id: true, publicScore: true, createdAt: true },
  });

  if (allCompleted.length > 0) {
    const best = allCompleted.reduce((b, s) => {
      const bs = b.publicScore ?? 0;
      const ss = s.publicScore ?? 0;
      if (ss > bs) return s;
      if (ss === bs && s.createdAt > b.createdAt) return s;
      return b;
    });
    await prisma.$transaction([
      prisma.submission.updateMany({
        where: { taskId: submission.taskId, userId: submission.userId, phase: submission.phase },
        data: { isFinal: false },
      }),
      prisma.submission.update({ where: { id: best.id }, data: { isFinal: true } }),
    ]);
  }
}
