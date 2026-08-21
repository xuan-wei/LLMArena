import { NextResponse } from "next/server";
import { createCaptcha } from "@/lib/captcha";

export async function GET() {
  const { id, svg } = createCaptcha();
  return NextResponse.json(
    { id, svg },
    { headers: { "Cache-Control": "no-store" } },
  );
}
