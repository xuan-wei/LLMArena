import { callOpenAICompatible } from "./openaiMode";
import { callDify } from "./difyMode";
import { callCoze } from "./cozeMode";

export class ChatbotError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "TIMEOUT"
      | "CONNECTION_ERROR"
      | "PARSE_ERROR"
      | "UNKNOWN"
  ) {
    super(message);
    this.name = "ChatbotError";
  }
}

export interface ChatbotConfig {
  mode: "OPENAI_COMPATIBLE" | "DIFY" | "COZE";
  systemPrompt?: string | null;
  apiBaseUrl?: string | null;
  apiKey?: string | null;
  apiModel?: string | null;
  enableThinking?: boolean;
  thinkingBudget?: number | null;
  temperature?: number | null;
  maxTokens?: number | null;
  difyEndpoint?: string | null;
  difyApiKey?: string | null;
  cozeEndpoint?: string | null;
  cozeApiKey?: string | null;
  cozeBotId?: string | null;
}

export async function callChatbot(
  config: ChatbotConfig,
  question: string,
  timeoutMs = 180000
): Promise<{ output: string; thinking: string; rawInput: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    switch (config.mode) {
      case "OPENAI_COMPATIBLE": {
        const result = await callOpenAICompatible(config, question, controller.signal, timeoutMs);
        return result;
      }
      case "DIFY": {
        const result = await callDify(config, question, controller.signal);
        return { ...result, thinking: "" };
      }
      case "COZE": {
        const result = await callCoze(config, question, controller.signal);
        return { ...result, thinking: "" };
      }
      default:
        throw new ChatbotError("Unknown mode", "UNKNOWN");
    }
  } catch (error) {
    if (error instanceof ChatbotError) throw error;
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("abort"))
    ) {
      throw new ChatbotError(`Timeout after ${timeoutMs}ms`, "TIMEOUT");
    }
    throw new ChatbotError(
      error instanceof Error ? error.message : "Unknown error",
      "CONNECTION_ERROR"
    );
  } finally {
    clearTimeout(timer);
  }
}
