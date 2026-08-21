import { NextResponse } from "next/server";
import type { JwtPayload } from "@/lib/auth";
import { st } from "@/lib/i18n/server";
import type { Language } from "@/lib/i18n";

/**
 * Feature-action guard. Returns a NextResponse to short-circuit with, or null
 * to proceed. Blocks unauthenticated requests (401) and, for non-admins,
 * requests from users whose email is not yet verified (403). ADMIN is exempt.
 *
 * Callers pass the already-resolved user (from getUser or getUserFresh) so this
 * stays a cheap synchronous check with no extra DB round-trip.
 */
export function requireVerified(
  user: JwtPayload | null,
  lang: Language,
): NextResponse | null {
  if (!user) {
    return NextResponse.json({ error: st(lang, "auth.notLoggedIn") }, { status: 401 });
  }
  if (user.role !== "ADMIN" && !user.emailVerified) {
    return NextResponse.json({ error: st(lang, "api.emailNotVerified") }, { status: 403 });
  }
  return null;
}
