const ONLINE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

class OnlineTracker {
  private lastSeen = new Map<string, number>();

  touch(userId: string) {
    this.lastSeen.set(userId, Date.now());
  }

  countOnline(): number {
    const cutoff = Date.now() - ONLINE_TIMEOUT_MS;
    let count = 0;
    for (const [, ts] of this.lastSeen) {
      if (ts > cutoff) count++;
    }
    if (Math.random() < 0.1) this.cleanup();
    return count;
  }

  private cleanup() {
    const cutoff = Date.now() - ONLINE_TIMEOUT_MS;
    for (const [id, ts] of this.lastSeen) {
      if (ts <= cutoff) this.lastSeen.delete(id);
    }
  }
}

const globalForTracker = globalThis as unknown as { onlineTracker: OnlineTracker };
export const onlineTracker = globalForTracker.onlineTracker ?? new OnlineTracker();
globalForTracker.onlineTracker = onlineTracker;
