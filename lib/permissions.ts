import type { JwtPayload } from "./auth";

/** Type guard — narrows JwtPayload | null → JwtPayload */
export const canPublishTasks = (u: JwtPayload | null): u is JwtPayload =>
  u !== null && (u.role === "ADMIN" || u.canPublish === true);

/** Plain boolean check (no type narrowing side effects) */
export const isAdmin = (u: JwtPayload | null): boolean =>
  u !== null && u.role === "ADMIN";

/** Can manage a specific task — admin can manage all; publisher can only manage own */
export const canManageTask = (
  u: JwtPayload | null,
  taskCreatedBy: string | null,
): boolean => {
  if (!u) return false;
  if (u.role === "ADMIN") return true;
  if (!u.canPublish) return false;
  return taskCreatedBy === u.sub;
};
