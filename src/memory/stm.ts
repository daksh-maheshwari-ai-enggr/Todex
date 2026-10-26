import { v4 as uuid } from "uuid";
import { ensureMemoryDir } from "../workspace";
import { readSTM, writeSTM } from "./store";
import type { STMRecord, STMTurn, CompactResult } from "./types";
import { compactSTM } from "./compactor";

/* ---------------------------------------------------------------------------
 * STM write
 * ------------------------------------------------------------------------ */

export type CreateSTMInput = {
  sessionId?: string;
  userId: string;
  summary?: string;
  scratchpad?: string;
  todosSnapshot?: unknown[];
};

export function createSTM(input: CreateSTMInput): STMRecord {
  const now = new Date().toISOString();
  return {
    sessionId: input.sessionId ?? uuid(),
    userId: input.userId,
    createdAt: now,
    updatedAt: now,
    summary: input.summary ?? "",
    turns: [],
    scratchpad: input.scratchpad ?? "",
    todosSnapshot: input.todosSnapshot,
  };
}

export function loadOrCreateSTM(input: CreateSTMInput): STMRecord {
  ensureMemoryDir();
  const existing = readSTM(input.sessionId ?? "");
  if (existing) return existing;
  return createSTM(input);
}

export function appendTurn(
  record: STMRecord,
  turn: STMTurn
): STMRecord {
  return {
    ...record,
    turns: [...record.turns, turn],
    updatedAt: new Date().toISOString(),
  };
}

export function appendTurns(
  record: STMRecord,
  turns: STMTurn[]
): STMRecord {
  if (!turns.length) return record;
  return {
    ...record,
    turns: [...record.turns, ...turns],
    updatedAt: new Date().toISOString(),
  };
}

export function setScratchpad(
  record: STMRecord,
  scratchpad: string
): STMRecord {
  return { ...record, scratchpad, updatedAt: new Date().toISOString() };
}

export function setTodosSnapshot(
  record: STMRecord,
  todos: unknown[]
): STMRecord {
  return { ...record, todosSnapshot: todos, updatedAt: new Date().toISOString() };
}

export function saveSTM(record: STMRecord): void {
  writeSTM(record);
}

export async function saveAndCompact(
  record: STMRecord,
  summarizeFn: (text: string) => Promise<string>
): Promise<CompactResult> {
  const result = await compactSTM(record, summarizeFn);
  writeSTM(result.stm);
  return result;
}

/* ---------------------------------------------------------------------------
 * STM read
 * ------------------------------------------------------------------------ */

/** Snapshot the current STM as a context block for the model. */
export function renderSTMContext(record: STMRecord, maxTurns = 6): string {
  const parts: string[] = [];

  if (record.summary) {
    parts.push(`## Short-term summary\n${record.summary}`);
  }

  if (record.scratchpad) {
    parts.push(`## Working notes\n${record.scratchpad}`);
  }

  const recent = record.turns.slice(-maxTurns);
  if (recent.length) {
    parts.push(
      `## Recent turns (${recent.length})\n` +
        recent
          .map((t) => `- ${t.role === "user" ? "User" : "Assistant"}: ${t.content.slice(0, 400)}`)
          .join("\n")
    );
  }

  return parts.join("\n\n");
}

/** Build MemoryHits from the most recent STM turns (scored by recency). */
export function stmHits(
  record: STMRecord,
  query: string,
  limit = 4
): import("./types").MemoryHit[] {
  const recent = record.turns.slice(-10);
  const q = query.toLowerCase();
  const scored = recent
    .map((t, i) => {
      const text = t.content.toLowerCase();
      const wordHits = q
        .split(/\s+/)
        .filter((w) => w.length > 1)
        .reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
      // Recency weight: newer turns score higher.
      const recency = (i + 1) / recent.length;
      return {
        turn: t,
        index: i,
        score: wordHits * 0.5 + recency * 0.5,
      };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s, i) => ({
    id: `stm:turn:${s.index}`,
    source: "stm" as const,
    content: s.turn.content,
    score: s.score,
  }));
}