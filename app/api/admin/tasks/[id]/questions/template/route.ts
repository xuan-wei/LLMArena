import { getUserFresh } from "@/lib/auth";
import { canPublishTasks } from "@/lib/permissions";
import { getRequestLanguage, st } from "@/lib/i18n/server";
import { questionCsvTemplate } from "@/lib/i18n/templates";

export async function GET(request: Request) {
  const user = await getUserFresh(request);
  const lang = await getRequestLanguage(request);
  if (!canPublishTasks(user)) {
    return new Response(st(lang, "api.noPermission"), { status: 403 });
  }

  const csv = "\uFEFF" + questionCsvTemplate(lang).replace(/\n/g, "\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="questions_template.csv"',
    },
  });
}
