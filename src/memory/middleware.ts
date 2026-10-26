import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  trimMessages,
} from "@langchain/core/messages";
import {
  countTokensApproximately,
  summarizationMiddleware,
} from "langchain";
import type { AgentMiddleware } from "langchain";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";

/**
 * Memory-layer middleware, built on LangChain primitives.
 *
 * Two pieces:
 *
 * 1. `summarizationMiddleware` — the idiomatic compactor. When the message
 *    history crosses a token threshold it summarises the older messages with
 *    a fast model and keeps the recent ones. This replaces the bespoke
 *    `compactSTM` logic with a first-party, callback-aware, tracing-enabled
 *    implementation.
 *
 * 2. `trimMessages` — the canonical token-budget trimmer, used to bound the
 *    context handed to the memory agent before each turn.
 */

export const DEFAULT_SUMMARY_TRIGGER_TOKENS = 4000;
export const DEFAULT_SUMMARY_KEEP_TOKENS = 2000;
export const DEFAULT_SUMMARY_KEEP_MESSAGES = 6;

/**
 * Build the summarization middleware for the memory agent.
 *
 * The summarisation model is the caller's `auto:fast` slot — never the main
 * reasoning model — so compaction stays cheap and off the hot path.
 */
export function buildSummarizationMiddleware(options: {
  model: BaseLanguageModel;
  triggerTokens?: number;
  keepTokens?: number;
  keepMessages?: number;
  summaryPrompt?: string;
  summaryPrefix?: string;
}): AgentMiddleware {
  const triggerTokens = options.triggerTokens ?? DEFAULT_SUMMARY_TRIGGER_TOKENS;
  const keepTokens = options.keepTokens ?? DEFAULT_SUMMARY_KEEP_TOKENS;
  const keepMessages = options.keepMessages ?? DEFAULT_SUMMARY_KEEP_MESSAGES;

  return summarizationMiddleware({
    model: options.model,
    trigger: { tokens: triggerTokens, messages: 3 },
    keep: { tokens: keepTokens, messages: keepMessages },
    tokenCounter: (msgs) => countTokensApproximately(msgs),
    summaryPrompt:
      options.summaryPrompt ??
      `You are maintaining a running summary of an AI coding agent's short-term memory.

Summarize the following conversation history into a single concise markdown block. Preserve every decision, fact, user preference, and open question. Drop conversational filler and tool noise. Stay under 600 tokens. Record substance directly — never say "the user said".

Summary:`,
    summaryPrefix: options.summaryPrefix ?? "## Short-term summary",
  });
}

/**
 * Trim a message list to a token budget, keeping the most recent messages.
 *
 * Wraps `trimMessages` so callers get a one-liner with a sane default
 * token counter.
 */
export async function trimToBudget(
  messages: BaseMessage[],
  maxTokens: number
): Promise<BaseMessage[]> {
  if (!messages.length) return [];
  return trimMessages(messages, {
    maxTokens,
    tokenCounter: (msgs) => countTokensApproximately(msgs),
    strategy: "last",
  });
}

/** Convert an STM record's turns into LangChain messages. */
export function stmTurnsToMessages(
  turns: Array<{ role: "user" | "assistant"; content: string }>
): BaseMessage[] {
  return turns.map((t) =>
    t.role === "user"
      ? new HumanMessage(t.content)
      : new SystemMessage(`Assistant: ${t.content}`)
  );
}

/** Approximate token count for a message list. */
export function tokenCount(messages: BaseMessage[]): number {
  return countTokensApproximately(messages);
}