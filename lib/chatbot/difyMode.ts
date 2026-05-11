import type { ChatbotConfig } from "./index";
import { ChatbotError } from "./index";

export async function callDifyStream(
  config: ChatbotConfig,
  question: string,
  signal: AbortSignal,
  onContent: (chunk: string) => void,
): Promise<{ output: string }> {
  if (!config.difyEndpoint || !config.difyApiKey) {
    throw new ChatbotError("Dify config incomplete", "CONNECTION_ERROR");
  }

  const base = config.difyEndpoint.replace(/\/+$/, "");
  const url = base.endsWith("/v1") ? `${base}/chat-messages` : `${base}/v1/chat-messages`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.difyApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: {},
        query: question,
        response_mode: "streaming",
        conversation_id: "",
        user: "arena-eval",
      }),
      signal,
    });
  } catch (error) {
    throw new ChatbotError(
      error instanceof Error ? error.message : "Dify request failed",
      "CONNECTION_ERROR"
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ChatbotError(`Dify API error ${response.status}: ${text}`, "CONNECTION_ERROR");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new ChatbotError("No response body", "CONNECTION_ERROR");

  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const event = JSON.parse(raw);
          if ((event.event === "message" || event.event === "agent_message") && event.answer) {
            output += event.answer;
            onContent(event.answer);
          }
        } catch { /* skip malformed lines */ }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (!output) throw new ChatbotError("Empty answer from Dify", "PARSE_ERROR");
  return { output };
}

export async function callDify(
  config: ChatbotConfig,
  question: string,
  signal: AbortSignal
): Promise<{ output: string; rawInput: string }> {
  if (!config.difyEndpoint || !config.difyApiKey) {
    throw new ChatbotError("Dify config incomplete", "CONNECTION_ERROR");
  }

  const base = config.difyEndpoint.replace(/\/+$/, "");
  const url = base.endsWith("/v1") ? `${base}/chat-messages` : `${base}/v1/chat-messages`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.difyApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: {},
        query: question,
        response_mode: "blocking",
        conversation_id: "",
        user: "arena-eval",
      }),
      signal,
    });
  } catch (error) {
    throw new ChatbotError(
      error instanceof Error ? error.message : "Dify request failed",
      "CONNECTION_ERROR"
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ChatbotError(`Dify API error ${response.status}: ${text}`, "CONNECTION_ERROR");
  }

  let data: { answer?: string; message?: string };
  try {
    data = await response.json();
  } catch {
    throw new ChatbotError("Failed to parse Dify response", "PARSE_ERROR");
  }

  const answer = data.answer || data.message;
  if (!answer) throw new ChatbotError("Empty answer from Dify", "PARSE_ERROR");
  const rawInput = `[Dify] POST ${url}\nquery: ${question}`;
  return { output: answer, rawInput };
}
