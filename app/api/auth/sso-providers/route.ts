import { NextResponse } from "next/server";
import { getEnabledSSOProviders } from "@/lib/sso/index";

export async function GET() {
  const providers = getEnabledSSOProviders().map(({ id, name, shortName, redirectPath }) => ({
    id, name, shortName, redirectPath,
  }));
  return NextResponse.json({ providers });
}
