import type { STMRecord, STMTurn, CompactResult } from "./types";
import type { BaseMessage } from "@langchain/core/messages";
import { isHumanMessage } from "@langchain/core/messages";
import { countTokensApproximately, trimMessages } from "langchain";
import { stmTurnsToMessages } from "./middleware";

/**
 * STM compaction, built on LangChain primitives.
 *
 * The summarisation itself is delegated to a caller-supplied async function
 * (an `auto:fast` LLM call), so this module stays pure and testable. Token
 * counting uses `countTokensApproximately` and the final kept window is
 * bounded with `trimMessages`, the same primitives the summarization
 * middleware uses internally.
 */

export type SummarizeFn = (text: string) => Promise<string>;

const DEFAULT_THRESHOLD = 4000;
const DEFAULT_KEEP_RECENT = 6;
const DEFAULT_KEEP_TOKENS = 2000;

function turnText(turn: STMTurn): string {
  return `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`;
}

function recordMessages(record: STMRecord): BaseMessage[] {
  return stmTurnsToMessages(record.turns);
}

function recordTokens(record: STMRecord): number {
  return countTokensApproximately(recordMessages(record));
}

async function summarize(
  summarizeFn: SummarizeFn,
  summary: string,
  turns: STMTurn[]
): Promise<string> {
  const transcript = turns.map(turnText).join("\n\n");
  const prompt = `You are maintaining a running summary of an AI coding agent's short-term memory.

Existing summary:
${summary || "(none yet)"}

New transcript to fold in:
${transcript}

Produce a single concise markdown summary that:
1. Preserves every decision, fact, and open question.
2. Drops conversational filler and tool noise.
3. Stays under 600 tokens.
4. Never says "the user said" — record the substance directly.

Summary:`;

  return (await summarizeFn(prompt)).trim();
}

/**
 * Compact `record` if it exceeds `threshold` tokens.
 *
 * Returns `{ compacted: false, ... }` unchanged when under budget, so callers
 * can call this unconditionally on every STM write.
 */
export async function compactSTM(
  record: STMRecord,
  summarizeFn: SummarizeFn,
  threshold = DEFAULT_THRESHOLD,
  keepRecent = DEFAULT_KEEP_RECENT,
  keepTokens = DEFAULT_KEEP_TOKENS
): Promise<CompactResult> {
  const before = recordTokens(record);

  if (before <= threshold || record.turns.length <= keepRecent) {
    return { compacted: false, beforeTokens: before, afterTokens: before, stm: record };
  }

  const evicted = record.turns.slice(0, record.turns.length - keepRecent);
  const kept = record.turns.slice(record.turns.length - keepRecent);

  const newSummary = await summarize(summarizeFn, record.summary, evicted);

  // Bound the kept window with the canonical trimmer so the STM never grows
  // unbounded even when the compactor is bypassed.
  let keptMessages = stmTurnsToMessages(kept);
  try {
    keptMessages = await trimMessages(keptMessages, {
      maxTokens: keepTokens,
      tokenCounter: countTokensApproximately,
      strategy: "last",
    });
  } catch {
    // keep the full window if trimming fails
  }

  const next: STMRecord = {
    ...record,
    summary: newSummary,
    turns: keptMessages
      .map((m) => ({
        role: (isHumanMessage(m) ? "user" : "assistant") as "user" | "assistant",
        content: typeof m.content === "string" ? m.content : "",
        ts: new Date().toISOString(),
      }))
      .filter((t) => t.content),
    updatedAt: new Date().toISOString(),
  };

  return {
    compacted: true,
    beforeTokens: before,
    afterTokens: recordTokens(next),
    stm: next,
  };
}