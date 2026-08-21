import svgCaptcha from "svg-captcha";
import crypto from "crypto";

interface CaptchaEntry {
  text: string;
  expiresAt: number;
}

// In-process store, mirroring lib/rateLimit.ts. Single-container deployment.
const store = new Map<string, CaptchaEntry>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) store.delete(id);
  }
}, 600000);

export function createCaptcha(): { id: string; svg: string } {
  const captcha = svgCaptcha.create({
    size: 4,
    noise: 3,
    color: true,
    ignoreChars: "0o1ilI",
    width: 140,
    height: 48,
  });
  const id = crypto.randomBytes(16).toString("hex");
  store.set(id, { text: captcha.text.toLowerCase(), expiresAt: Date.now() + TTL_MS });
  return { id, svg: captcha.data };
}

/** One-time, case-insensitive verification. Consumes the challenge on any attempt. */
export function verifyCaptcha(id: string | undefined, text: string | undefined): boolean {
  if (!id || !text) return false;
  const entry = store.get(id);
  store.delete(id); // one attempt per challenge
  if (!entry || entry.expiresAt <= Date.now()) return false;
  return entry.text === text.trim().toLowerCase();
}
