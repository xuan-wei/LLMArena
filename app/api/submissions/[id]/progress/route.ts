import { getUser, verifyJWT } from "@/lib/auth";
import { submissionQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // EventSource can't set headers, so also accept token from query parameter
  let user = getUser(request);
  if (!user) {
    const url = new URL(request.url);
    const qToken = url.searchParams.get("token");
    if (qToken) user = verifyJWT(qToken);
  }
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const submission = await prisma.submission.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!submission) return new Response("Not found", { status: 404 });
  if (submission.userId !== user.sub && user.role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const send = (data: unknown) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  let lastKey = "";
  const interval = setInterval(async () => {
    try {
      const job = submissionQueue.getBySubmissionId(id);

      if (!job) {
        const sub = await prisma.submission.findUnique({
          where: { id },
          select: { status: true },
        });

        if (sub?.status === "COMPLETED" || sub?.status === "FAILED" || sub?.status === "SYSERR") {
          send({ done: true, status: sub.status });
          clearInterval(interval);
          writer.close().catch(() => {});
        } else if (lastKey !== "waiting") {
          send({ done: false, completed: 0, total: 0, currentQuestion: "Waiting..." });
          lastKey = "waiting";
        }
        return;
      }

      const key = JSON.stringify(job.progress);
      if (key !== lastKey) {
        send(job.progress);
        lastKey = key;
      }

      if (job.progress.done) {
        clearInterval(interval);
        setTimeout(() => writer.close().catch(() => {}), 200);
      }
    } catch {
      clearInterval(interval);
      writer.close().catch(() => {});
    }
  }, 500);

  request.signal.addEventListener("abort", () => {
    clearInterval(interval);
    writer.close().catch(() => {});
  });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
