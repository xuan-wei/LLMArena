import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import jaccount from "./providers/jaccount";

// ─── Provider interface ────────────────────────────────────────────────────────

export interface SSOProviderImpl {
  id: string;
  name: string;
  shortName: string;
  isEnabled(): boolean;
  buildAuthorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<{
    sub: string;
    name?: string;
    /** 学号/工号 — provider-specific ID shown in admin UI */
    institutionId?: string;
    /** If the provider supplies an email directly; otherwise buildEmail(sub) is used */
    email?: string;
  }>;
  /** Derive the email stored in DB from the provider's sub (username) */
  buildEmail(sub: string): string;
}

// Public shape returned to the frontend
export interface SSOProvider {
  id: string;
  name: string;
  shortName: string;
  redirectPath: string;
}

// ─── Registry ─────────────────────────────────────────────────────────────────
// To add a new institution: create lib/sso/providers/<id>.ts and add it here.

const ALL_PROVIDERS: SSOProviderImpl[] = [jaccount];

export function getProvider(id: string): SSOProviderImpl | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}

export function getEnabledSSOProviders(): SSOProvider[] {
  return ALL_PROVIDERS.filter((p) => p.isEnabled()).map((p) => ({
    id: p.id,
    name: p.name,
    shortName: p.shortName,
    redirectPath: `/api/auth/sso/${p.id}/redirect`,
  }));
}

// ─── HMAC state helpers ────────────────────────────────────────────────────────
// State format: timestamp.random.HMAC

export function buildState(): string {
  const timestamp = Date.now().toString();
  const random = crypto.randomBytes(12).toString("hex");
  const raw = `${timestamp}.${random}`;
  const sig = crypto
    .createHmac("sha256", process.env.JWT_SECRET!)
    .update(raw)
    .digest("hex");
  return `${raw}.${sig}`;
}

export function verifyState(state: string): boolean {
  const lastDot = state.lastIndexOf(".");
  if (lastDot === -1) return false;
  const raw = state.slice(0, lastDot);
  const sig = state.slice(lastDot + 1);

  let expectedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(
      crypto.createHmac("sha256", process.env.JWT_SECRET!).update(raw).digest("hex"),
      "hex",
    );
  } catch {
    return false;
  }

  let sigBuf: Buffer;
  try {
    sigBuf = Buffer.from(sig, "hex");
  } catch {
    return false;
  }

  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

  // Check expiry (10 minutes)
  const timestamp = parseInt(raw.split(".")[0], 10);
  return Date.now() - timestamp < 10 * 60 * 1000;
}

// ─── User upsert ──────────────────────────────────────────────────────────────

export async function upsertSSOUser(
  email: string,
  name: string,
  institution: string,
  institutionId?: string,
): Promise<{ id: string; email: string; name: string | null; role: string; canPublish: boolean; language: string }> {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name, passwordHash: null, institution, institutionId: institutionId ?? null, language: "zh" },
    });
  } else {
    // Keep institution fields up to date (e.g. student ID may change on re-login)
    user = await prisma.user.update({
      where: { email },
      data: { institution, institutionId: institutionId ?? null },
    });
  }
  return user;
}
