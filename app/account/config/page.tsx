import { redirect } from "next/navigation";
export default function LegacyConfigPage() {
  redirect("/account/llm-config");
}
