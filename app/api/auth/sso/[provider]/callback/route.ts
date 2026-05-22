import { NextResponse } from "next/server";
import { getProvider, verifyState, upsertSSOUser } from "@/lib/sso";
import { signJWT } from "@/lib/auth";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const lang = await getRequestLanguage(request);
  const { provider: providerId } = await params;
  const url = new URL(request.url);
  const origin = url.origin;
  const loginUrl = (msg: string) => `${origin}/login?error=${encodeURIComponent(msg)}`;

  const provider = getProvider(providerId);
  if (!provider || !provider.isEnabled()) {
    return NextResponse.redirect(loginUrl(st(lang, "api.ssoProviderNotFound")));
  }

  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return NextResponse.redirect(loginUrl(st(lang, "api.ssoAuthDenied")));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(loginUrl(st(lang, "api.ssoMissingParams")));
  }

  if (!verifyState(state)) {
    return NextResponse.redirect(loginUrl(st(lang, "api.ssoStateVerifyFailed")));
  }

  // Use the configured redirect URI (env var) for token exchange — must match
  // what was sent in the authorization request.
  // Derive the user-facing origin from the configured URI so the final redirect
  // goes back to the right host (Next.js normalizes request.url to localhost
  // internally, so we cannot rely on `origin` from request.url).
  const callbackUri =
    process.env[`${providerId.toUpperCase()}_REDIRECT_URI`] ??
    `${origin}/api/auth/sso/${providerId}/callback`;
  const userOrigin = new URL(callbackUri).origin;

  let sub: string;
  let name: string | undefined;
  let institutionId: string | undefined;
  let providerEmail: string | undefined;
  try {
    const result = await provider.exchangeCode(code, callbackUri);
    sub = result.sub;
    name = result.name;
    institutionId = result.institutionId;
    providerEmail = result.email;
  } catch (e) {
    const msg = e instanceof Error ? e.message : st(lang, "api.ssoUserInfoFailed");
    return NextResponse.redirect(`${userOrigin}/login?error=${encodeURIComponent(msg)}`);
  }

  const email = providerEmail || provider.buildEmail(sub);
  const displayName = name || sub;

  const user = await upsertSSOUser(email, displayName, providerId, institutionId);
  const token = signJWT({ sub: user.id, email: user.email, role: user.role, name: user.name ?? displayName, canPublish: user.canPublish });
  return NextResponse.redirect(`${userOrigin}/sso-success?token=${token}`);
}
