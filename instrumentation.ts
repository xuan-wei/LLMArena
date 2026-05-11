// A submission that has been RUNNING for longer than this is assumed to be stuck.
const RUNNING_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export async function register() {
  // Only run on server side
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { prisma } = await import("@/lib/prisma");
  const { submissionQueue } = await import("@/lib/queue");

  // On startup: expire genuinely stuck RUNNING submissions, then re-enqueue the rest.
  const now = new Date();
  const stuckBefore = new Date(now.getTime() - RUNNING_TIMEOUT_MS);

  // Submissions that have been RUNNING for over 30 min are stuck — mark FAILED.
  const stuck = await prisma.submission.updateMany({
    where: { status: "RUNNING", createdAt: { lt: stuckBefore } },
    data: { status: "FAILED", errorMessage: "服务器重启后超时未恢复，已标记为失败" },
  });
  if (stuck.count > 0) {
    console.log(`[queue] Marked ${stuck.count} timed-out submission(s) as FAILED.`);
  }

  // Re-enqueue any remaining PENDING or recently-interrupted RUNNING submissions.
  const orphaned = await prisma.submission.findMany({
    where: { status: { in: ["PENDING", "RUNNING"] } },
    select: { id: true },
  });

  if (orphaned.length > 0) {
    console.log(`[queue] Re-enqueueing ${orphaned.length} interrupted submission(s)...`);
    // Reset RUNNING → PENDING so the atomic claim in the worker can pick them up
    await prisma.submission.updateMany({
      where: { status: "RUNNING" },
      data: { status: "PENDING" },
    });
    for (const { id } of orphaned) {
      submissionQueue.requeue(id);
    }
  }

  // Periodic watchdog: every 10 minutes, fail any submission that has been
  // RUNNING for more than 30 minutes (catches cases where the worker hangs
  // without crashing, e.g. a hung LLM call that never resolves).
  setInterval(async () => {
    const cutoff = new Date(Date.now() - RUNNING_TIMEOUT_MS);
    const expired = await prisma.submission.updateMany({
      where: { status: "RUNNING", createdAt: { lt: cutoff } },
      data: { status: "FAILED", errorMessage: "运行超时（30 分钟），已自动标记为失败" },
    });
    if (expired.count > 0) {
      console.warn(`[queue] Watchdog: timed out ${expired.count} stuck submission(s).`);
    }
  }, 10 * 60 * 1000);
}
