import path from "path";
import type { ChildProcess } from "child_process";

export interface JobProgress {
  completed: number;
  total: number;
  currentQuestion?: string;
  phase?: "generating" | "evaluating" | "done";
  done: boolean;
  error?: string;
}

export interface Job {
  id: string;
  submissionId: string;
  status: "pending" | "running" | "done" | "failed";
  progress: JobProgress;
  createdAt: Date;
}

// ─── Worker-process bridge (production) ───────────────────────────────────────
//
// We use child_process.fork() instead of worker_threads.Worker() because
// Turbopack statically resolves the path passed to `new Worker(path)` at
// build time and fails when worker.js doesn't exist yet.  fork() is a plain
// function call that bundlers do not special-case, so static analysis is not
// triggered.

type WorkerMsg = {
  type: "progress" | "done" | "error";
  submissionId: string;
  progress?: Partial<JobProgress>;
  message?: string;
};

let _worker: ChildProcess | null = null;

function getWorker(): ChildProcess {
  if (_worker) return _worker;

  // worker.js is compiled by esbuild and placed next to server.js in the
  // standalone output.  process.cwd() at runtime points to that directory.
  //
  // Turbopack intercepts any call whose first argument traces back to
  // path.join(process.cwd(), ...) and treats it as a module import.  We
  // defeat this by computing the path through process.env so the value is
  // fully opaque to static analysis.
  //
  // WORKER_PATH is set by the entrypoint to __dirname/worker.js so we don't
  // even need process.cwd() here.  The fallback builds the path from
  // process.env strings so Turbopack sees no resolvable path at build time.
  const workerPath =
    process.env.WORKER_PATH ||
    (process.env.WORKER_DIR || process.cwd()) +
      path.sep +
      (process.env.WORKER_FILE || "worker.js");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fork } = require("child_process") as typeof import("child_process");
  _worker = fork(workerPath, [], {
    stdio: "inherit",          // worker stdout/stderr goes to the same console
    env: { ...process.env },   // inherit DATABASE_URL, LLM_CONCURRENCY, etc.
  });

  const w = _worker;

  w.on("message", (msg: WorkerMsg) => {
    try {
      if (msg.type === "progress" && msg.progress) {
        submissionQueue.updateProgress(msg.submissionId, msg.progress);
      } else if (msg.type === "done") {
        submissionQueue.markDone(msg.submissionId);
      } else if (msg.type === "error") {
        submissionQueue.markDone(msg.submissionId, msg.message);
      }
    } catch (err) {
      console.error("[SubmissionQueue] Error handling worker message:", err);
    }
  });

  w.on("error", (err) => {
    console.error("[SubmissionQueue] Worker process error:", err);
    if (_worker === w) _worker = null;
  });

  w.on("exit", (code) => {
    if (code !== 0) console.error(`[SubmissionQueue] Worker process exited with code ${code}`);
    if (_worker === w) _worker = null;
  });

  return w;
}

// ─── In-process fallback (development) ───────────────────────────────────────

function enqueueDev(submissionId: string, queue: SubmissionQueue) {
  // Lazy import to avoid loading heavy deps until needed.
  import("./submissionWorker")
    .then(({ runSubmissionWorker }) =>
      runSubmissionWorker(submissionId, (p) => queue.updateProgress(submissionId, p))
    )
    .then(() => queue.markDone(submissionId))
    .catch((err: unknown) =>
      queue.markDone(
        submissionId,
        err instanceof Error ? err.message : "Unknown error"
      )
    );
}

// ─── Queue ────────────────────────────────────────────────────────────────────

class SubmissionQueue {
  private jobs = new Map<string, Job>();

  enqueue(submissionId: string): Job {
    const existing = this.getBySubmissionId(submissionId);
    if (existing) return existing;

    const job: Job = {
      id: submissionId,
      submissionId,
      status: "pending",
      progress: { completed: 0, total: 0, done: false },
      createdAt: new Date(),
    };
    this.jobs.set(submissionId, job);

    if (process.env.NODE_ENV === "production") {
      getWorker().send({ type: "enqueue", submissionId });
    } else {
      enqueueDev(submissionId, this);
    }

    return job;
  }

  getBySubmissionId(submissionId: string): Job | undefined {
    return this.jobs.get(submissionId);
  }

  updateProgress(submissionId: string, progress: Partial<JobProgress>) {
    const job = this.jobs.get(submissionId);
    if (job) {
      job.progress = { ...job.progress, ...progress };
    }
  }

  markDone(submissionId: string, error?: string) {
    const job = this.jobs.get(submissionId);
    if (job) {
      job.status = error ? "failed" : "done";
      job.progress = { ...job.progress, done: true, ...(error ? { error } : {}) };
      this.cleanup();
    }
  }

  // Re-enqueue a submission that was left RUNNING after a process restart.
  requeue(submissionId: string): void {
    this.jobs.delete(submissionId);
    this.enqueue(submissionId);
  }

  private cleanup() {
    if (this.jobs.size <= 200) return;
    const toDelete = this.jobs.size - 200;
    let count = 0;
    for (const [jobId] of this.jobs) {
      if (count++ >= toDelete) break;
      this.jobs.delete(jobId);
    }
  }
}

const globalForQueue = globalThis as unknown as { submissionQueue: SubmissionQueue };
export const submissionQueue =
  globalForQueue.submissionQueue || new SubmissionQueue();
globalForQueue.submissionQueue = submissionQueue;
