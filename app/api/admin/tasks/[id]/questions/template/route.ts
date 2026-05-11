import { getUser, getUserFresh } from "@/lib/auth";
import { canPublishTasks } from "@/lib/permissions";

export async function GET(request: Request) {
  const user = await getUserFresh(request);
  if (!canPublishTasks(user)) {
    return new Response("无权限", { status: 403 });
  }

  const csv = "\uFEFF" + [
    "question,answer,private",
    '"请描述大语言模型的主要特点","基于Transformer架构、通过大规模语料预训练的语言模型",0',
    '"什么是 RAG？","检索增强生成，将外部检索与语言模型生成结合的技术",0',
    '"写一个关于AI的故事（100字）","",1',
  ].join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="questions_template.csv"',
    },
  });
}
