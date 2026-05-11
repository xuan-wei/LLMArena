import type { ChatbotConfig } from "./index";
import { ChatbotError } from "./index";

export async function callCoze(
  config: ChatbotConfig,
  question: string,
  signal: AbortSignal
): Promise<{ output: string; rawInput: string }> {
  if (!config.cozeEndpoint || !config.cozeApiKey || !config.cozeBotId) {
    throw new ChatbotError("Coze config incomplete", "CONNECTION_ERROR");
  }

  // Normalize: strip query strings, trailing slashes, and known path suffixes
  const baseUrl = config.cozeEndpoint
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/\/v3\/chat$/, "")
    .replace(/\/v3$/, "");

  const headers = {
    Authorization: `Bearer ${config.cozeApiKey}`,
    "Content-Type": "application/json",
  };

  const body = JSON.stringify({
    bot_id: config.cozeBotId,
    user_id: "arena-eval",
    stream: true,
    additional_messages: [
      { role: "user", content: question, content_type: "text" },
    ],
  });

  const rawInput = `[Coze] bot_id: ${config.cozeBotId}\nuser: ${question}`;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v3/chat`, {
      method: "POST",
      headers,
      body,
      signal,
    });
  } catch (error) {
    throw new ChatbotError(
      error instanceof Error ? error.message : "Coze request failed",
      "CONNECTION_ERROR"
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ChatbotError(`Coze API error ${response.status}: ${text}`, "CONNECTION_ERROR");
  }

  // Parse SSE stream — collect the last completed answer message
  const reader = response.body?.getReader();
  if (!reader) throw new ChatbotError("No response body", "CONNECTION_ERROR");

  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";  // keep incomplete last line

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const event = JSON.parse(raw);
          // conversation.message.completed with type="answer" contains the full message
          if (event.type === "answer" && typeof event.content === "string" && event.content) {
            answer = event.content;
          }
        } catch { /* skip malformed lines */ }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (!answer) throw new ChatbotError("No answer from Coze", "PARSE_ERROR");
  return { output: answer, rawInput };
}
