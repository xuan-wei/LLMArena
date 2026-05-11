import OpenAI from "openai";
import type { ChatbotConfig } from "./index";
import { ChatbotError } from "./index";

export async function callOpenAICompatible(
  config: ChatbotConfig,
  question: string,
  signal: AbortSignal,
  timeoutMs = 180000
): Promise<{ output: string; thinking: string; rawInput: string }> {
  if (!config.apiBaseUrl || !config.apiKey || !config.apiModel) {
    throw new ChatbotError("OpenAI-compatible API config incomplete", "CONNECTION_ERROR");
  }

  const client = new OpenAI({
    baseURL: config.apiBaseUrl,
    apiKey: config.apiKey,
    timeout: timeoutMs,
    maxRetries: 0,
  });

  let messages: OpenAI.Chat.ChatCompletionMessageParam[];
  const prompt = config.systemPrompt?.trim();
  if (!prompt) {
    // No prompt: send question directly.
    messages = [{ role: "user", content: question }];
  } else if (prompt.includes("{{question}}")) {
    // Prompt contains placeholder: substitute it.
    messages = [{ role: "user", content: prompt.replace(/\{\{question\}\}/g, question) }];
  } else {
    // Prompt exists but has no placeholder: append question on a new line.
    messages = [{ role: "user", content: `${prompt}\n\n${question}` }];
  }

  const rawInput = JSON.stringify({ model: config.apiModel, messages }, null, 2);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const create = client.chat.completions.create.bind(client.chat.completions) as any;

  let thinking = "";
  let output = "";

  try {
    const stream = await create(
      {
        model: config.apiModel,
        messages,
        max_tokens: config.maxTokens ?? 2048,
        stream: true,
        ...(config.temperature != null && { temperature: config.temperature }),
        // Thinking / CoT control — send both forms to cover Qwen API, Ollama, and llama.cpp
        enable_thinking: config.enableThinking ?? false,
        chat_template_kwargs: { enable_thinking: config.enableThinking ?? false },
        ...(config.enableThinking
          ? {
              thinking_budget: config.thinkingBudget ?? 1024,   // Qwen API / Ollama
              reasoning_budget: config.thinkingBudget ?? 1024,  // llama.cpp
            }
          : { reasoning_budget: 0 }  // llama.cpp: enforce no thinking
        ),
      },
      { signal }
    );

    for await (const chunk of stream) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delta = (chunk.choices[0]?.delta) as any;
      if (delta?.reasoning_content) thinking += delta.reasoning_content;
      if (delta?.content) output += delta.content;
    }
  } catch (error) {
    // On timeout/abort: if we collected any content, return it as a partial result
    const isTimeout = signal.aborted ||
      (error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("timeout") || error.message.toLowerCase().includes("abort")));

    if (isTimeout) {
      // Return whatever was collected — empty output counts as timeout result
      const timeoutNote = `[超时 ${timeoutMs / 1000}s，部分结果]`;
      return {
        output: output || "",
        thinking: thinking ? thinking + `\n\n${timeoutNote}` : "",
        rawInput,
      };
    }

    if (error instanceof ChatbotError) throw error;
    throw new ChatbotError(
      error instanceof Error ? error.message : "API call failed",
      "CONNECTION_ERROR"
    );
  }

  if (!output && !thinking) throw new ChatbotError("Empty response", "PARSE_ERROR");
  return { output, thinking, rawInput };
}
