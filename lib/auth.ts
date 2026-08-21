import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return secret;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  name: string;
  canPublish?: boolean;
  emailVerified?: boolean;
  iat?: number;
  exp?: number;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signJWT(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyJWT(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

export function extractToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  // Also check cookie
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/arena_token=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

export function getUser(request: Request): JwtPayload | null {
  const token = extractToken(request);
  if (!token) return null;
  return verifyJWT(token);
}

/**
 * Like getUser() but fetches fresh canPublish and role from the DB so that
 * permission changes take effect immediately without requiring re-login.
 * Also enforces session invalidation: a token issued before the account's
 * last password change (passwordChangedAt) is rejected, so changing/resetting
 * a password kills all older sessions.
 * Use this in any route that checks canPublishTasks / canManageTask / role.
 */
export async function getUserFresh(request: Request): Promise<JwtPayload | null> {
  const payload = getUser(request);
  if (!payload) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { canPublish: true, role: true, passwordChangedAt: true, emailVerified: true },
  });
  if (!dbUser) return null;
  // Reject tokens minted before the last password change.
  if (dbUser.passwordChangedAt && typeof payload.iat === "number") {
    const changedSec = Math.floor(dbUser.passwordChangedAt.getTime() / 1000);
    if (payload.iat < changedSec) return null;
  }
  return { ...payload, canPublish: dbUser.canPublish, role: dbUser.role, emailVerified: dbUser.emailVerified };
}
