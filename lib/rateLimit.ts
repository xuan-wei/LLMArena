interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 3600000);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 600000);

export function rateLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): { ok: boolean; remaining: number } {
  const now = Date.now();
  const entry = store.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
  if (entry.timestamps.length >= maxRequests) {
    return { ok: false, remaining: 0 };
  }
  entry.timestamps.push(now);
  store.set(key, entry);
  return { ok: true, remaining: maxRequests - entry.timestamps.length };
}

export function getClientIP(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
