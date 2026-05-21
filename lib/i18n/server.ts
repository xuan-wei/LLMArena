import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { DEFAULT_LANGUAGE, type I18nKey, type I18nParams, normalizeLanguage, tFor } from "./index";

export async function getRequestLanguage(request: Request) {
  const payload = getUser(request);
  if (!payload) {
    const header = request.headers.get("X-Arena-Language");
    return header ? normalizeLanguage(header) : DEFAULT_LANGUAGE;
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { language: true },
  });
  return normalizeLanguage(user?.language);
}

export function st(language: unknown, key: I18nKey, params?: I18nParams) {
  return tFor(language, key, params);
}
