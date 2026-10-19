/**
 * Shared types for the memory layer (LTM + STM + retrieval).
 *
 * LTM = long-term memory, persisted under `.memory/` in the working project.
 * STM = short-term working memory, session-local, bounded and compacted.
 */

/** Where a durable fact lives inside LTM. */
export type MemoryCategory = "user" | "daily" | "module" | "index";

/** One section of an LTM markdown file, as indexed for retrieval. */
export type LTMSection = {
  /** Stable id used as the BM25 document id and the cross-channel merge key. */
  id: string;
  /** Relative path within `.memory/`. */
  path: string;
  /** File-level key (module name, date string, user id, "index"). */
  key: string;
  /** Section heading (or "(preamble)"). */
  section: string;
  category: MemoryCategory;
  content: string;
};

/** A persisted LTM write record. */
export type LTMRecord = {
  id: string;
  userId: string;
  category: MemoryCategory;
  key: string;
  section?: string;
  path: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  tokens: number;
};

/** One conversational turn in short-term memory. */
export type STMTurn = {
  ts: string;
  role: "user" | "assistant";
  content: string;
};

/** The session STM document. */
export type STMRecord = {
  sessionId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  /** Running compacted summary — survives turn eviction. */
  summary: string;
  /** Recent raw turns (oldest are evicted first by the compactor). */
  turns: STMTurn[];
  /** Agent scratchpad / working notes for the current task. */
  scratchpad: string;
  /** Optional snapshot of the active TODO list. */
  todosSnapshot?: unknown[];
};

/** One retrieval hit, regardless of source. */
export type MemoryHit = {
  id: string;
  source: "stm" | "ltm";
  category?: MemoryCategory;
  key?: string;
  section?: string;
  path?: string;
  content: string;
  score: number;
  bm25?: number;
  semantic?: number;
};

export type CompactResult = {
  compacted: boolean;
  beforeTokens: number;
  afterTokens: number;
  stm: STMRecord;
};

/** Default token budget for STM before compaction kicks in. */
export const DEFAULT_STM_THRESHOLD = 4000;
/** Turns kept (most recent) when compacting. */
export const DEFAULT_KEEP_RECENT = 6;
/** Hard cap on raw turns in STM (safety valve above the compactor). */
export const MAX_STM_TURNS = 100;
/** Default number of hits returned by a retrieval. */
export const DEFAULT_RETRIEVE_LIMIT = 8;

/** Rough token estimate — chars / 4. Good enough for budgeting. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}