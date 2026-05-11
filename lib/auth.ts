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
 * Use this in any route that checks canPublishTasks / canManageTask.
 */
export async function getUserFresh(request: Request): Promise<JwtPayload | null> {
  const payload = getUser(request);
  if (!payload) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { canPublish: true, role: true },
  });
  if (!dbUser) return null;
  return { ...payload, canPublish: dbUser.canPublish, role: dbUser.role };
}
