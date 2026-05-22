import { NextResponse } from "next/server";
import { getProvider, buildState } from "@/lib/sso";
import { getRequestLanguage, st } from "@/lib/i18n/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const lang = await getRequestLanguage(request);
  const { provider: providerId } = await params;
  const provider = getProvider(providerId);

  if (!provider || !provider.isEnabled()) {
    return NextResponse.json({ error: st(lang, "api.ssoProviderNotFound") }, { status: 404 });
  }

  // Build the callback URI from the actual request origin so that JAccount
  // redirects back to whatever host/IP the user is currently using.
  // JACCOUNT_REDIRECT_URI can override this (e.g. for production with a domain).
  const requestOrigin = new URL(request.url).origin;
  const callbackUri =
    process.env[`${providerId.toUpperCase()}_REDIRECT_URI`] ??
    `${requestOrigin}/api/auth/sso/${providerId}/callback`;

  const state = buildState();
  const authorizeUrl = provider.buildAuthorizeUrl(state, callbackUri);
  return NextResponse.redirect(authorizeUrl);
}
