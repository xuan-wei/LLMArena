/**
 * Worker process entry point.
 *
 * Compiled by esbuild → worker.js, placed next to server.js in the
 * standalone output.  Spawned via child_process.fork() so it runs in a
 * completely separate Node.js process with its own event loop — LLM work
 * never interferes with the HTTP server.
 *
 * IPC with main process:
 *   main  → worker : { type: "enqueue", submissionId }
 *   worker → main  : { type: "progress", submissionId, progress }
 *                    { type: "done",     submissionId }
 *                    { type: "error",    submissionId, message }
 */

import { runSubmissionWorker } from "./submissionWorker";
import type { JobProgress } from "./index";

const MAX_CONCURRENT = Math.max(
  1,
  parseInt(process.env.SUBMISSION_CONCURRENCY || "10")
);

const pending: string[] = [];
let running = 0;

function processNext() {
  while (running < MAX_CONCURRENT && pending.length > 0) {
    const submissionId = pending.shift()!;
    running++;

    const onProgress = (progress: Partial<JobProgress>) => {
      process.send?.({ type: "progress", submissionId, progress });
    };

    runSubmissionWorker(submissionId, onProgress)
      .then(() => {
        process.send?.({ type: "done", submissionId });
      })
      .catch((err: unknown) => {
        process.send?.({
          type: "error",
          submissionId,
          message: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        running--;
        processNext();
      });
  }
}

process.on("message", (msg: { type: string; submissionId: string }) => {
  if (msg.type === "enqueue") {
    pending.push(msg.submissionId);
    processNext();
  }
});
