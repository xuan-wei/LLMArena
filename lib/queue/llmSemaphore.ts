/**
 * Per-LLM concurrency semaphore.
 *
 * Each LLM account (identified by its key) gets its own slot pool so that a
 * slow or busy LLM never blocks submissions using a different LLM.
 *
 * This semaphore lives inside the Worker thread, so there is only ever one
 * instance — no cross-thread synchronisation is needed.
 *
 * Set LLM_CONCURRENCY in the environment to tune (default: 15).
 */

const MAX_PER_LLM = Math.max(1, parseInt(process.env.LLM_CONCURRENCY || "15"));

class LLMSemaphore {
  private running = new Map<string, number>();
  private waiting = new Map<string, Array<() => void>>();

  async acquire(key: string): Promise<void> {
    const current = this.running.get(key) ?? 0;
    if (current < MAX_PER_LLM) {
      this.running.set(key, current + 1);
      return;
    }
    return new Promise<void>((resolve) => {
      const q = this.waiting.get(key) ?? [];
      q.push(resolve);
      this.waiting.set(key, q);
    });
  }

  release(key: string): void {
    const q = this.waiting.get(key) ?? [];
    if (q.length > 0) {
      const next = q.shift()!;
      this.waiting.set(key, q);
      next();
    } else {
      this.running.set(key, Math.max(0, (this.running.get(key) ?? 1) - 1));
    }
  }
}

const globalForSemaphore = globalThis as unknown as { llmSemaphore: LLMSemaphore };
export const llmSemaphore =
  globalForSemaphore.llmSemaphore ?? new LLMSemaphore();
globalForSemaphore.llmSemaphore = llmSemaphore;
