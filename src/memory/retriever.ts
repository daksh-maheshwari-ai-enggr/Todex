import { searchBM25 } from "./bm25";
import { queryMemorySemantic, semanticAvailable } from "./semantic";
import type { MemoryHit, LTMSection } from "./types";
import type { BM25Index } from "./store";

/**
 * Hybrid retrieval: BM25 (40) + semantic (60), merged and re-ranked.
 *
 * Both channels run in parallel and their raw scores are normalised to
 * [0, 1] before weighting, so a channel that returned nothing degrades
 * gracefully instead of dragging the other one down.
 */

export const HYBRID_WEIGHTS = { bm25: 0.4, semantic: 0.6 } as const;

export type RetrieveOptions = {
  query: string;
  userId: string;
  limit?: number;
  /** Restrict to one LTM category (user / daily / module / index). */
  category?: string;
  /** Restrict to one LTM key (e.g. a user id, a date, a module name). */
  key?: string;
  /** Sources to search: "both" | "ltm" | "stm". Default "both". */
  sources?: "both" | "ltm" | "stm";
  /** Optional pre-built BM25 index (skips a rebuild when supplied). */
  bm25Index?: BM25Index | null;
  /** Optional STM hits to merge in. */
  stmHits?: MemoryHit[];
};

function normalize(scores: number[]): number[] {
  if (!scores.length) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) return scores.map((s) => (s > 0 ? 1 : 0));
  return scores.map((s) => (s - min) / (max - min));
}

function merge(
  bm25Hits: MemoryHit[],
  semanticHits: MemoryHit[]
): MemoryHit[] {
  const byId = new Map<string, MemoryHit>();

  const bm25Norm = normalize(bm25Hits.map((h) => h.bm25 ?? h.score));
  const semNorm = normalize(semanticHits.map((h) => h.semantic ?? h.score));

  for (let i = 0; i < bm25Hits.length; i++) {
    const hit = bm25Hits[i];
    byId.set(hit.id, {
      ...hit,
      bm25: bm25Norm[i],
      score: bm25Norm[i] * HYBRID_WEIGHTS.bm25,
    });
  }

  for (let i = 0; i < semanticHits.length; i++) {
    const hit = semanticHits[i];
    const existing = byId.get(hit.id);
    const sem = semNorm[i];
    const contribution = sem * HYBRID_WEIGHTS.semantic;

    if (existing) {
      existing.semantic = sem;
      existing.score = (existing.score ?? 0) + contribution;
    } else {
      byId.set(hit.id, {
        ...hit,
        semantic: sem,
        score: contribution,
      });
    }
  }

  return [...byId.values()].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0)
  );
}

/**
 * Run the hybrid retrieval across LTM (and optionally STM).
 *
 * BM25 and semantic run concurrently; results are merged and re-ranked by
 * weighted score. Pass a `rerank` callback to let an LLM trim the top-N
 * down further (bounded — see `rerankTopN`).
 */
export async function retrieve(opts: RetrieveOptions): Promise<MemoryHit[]> {
  const limit = opts.limit ?? 8;
  const bm25Hits: MemoryHit[] = [];
  const semanticHits: MemoryHit[] = [];

  const wantLTM = !opts.sources || opts.sources === "both" || opts.sources === "ltm";

  if (wantLTM && opts.bm25Index) {
    bm25Hits.push(
      ...searchBM25(opts.bm25Index, opts.query, limit * 2, {
        category: opts.category,
        key: opts.key,
      })
    );
  }

  if (wantLTM && semanticAvailable()) {
    semanticHits.push(
      ...(await queryMemorySemantic({
        query: opts.query,
        userId: opts.userId,
        k: limit * 2,
        category: opts.category,
      }))
    );
  }

  const merged = merge(bm25Hits, semanticHits);

  const stmHits = opts.stmHits ?? [];
  const all = [...merged, ...stmHits].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0)
  );

  return all.slice(0, limit);
}

/** LTM-only retrieval (BM25 + semantic). */
export async function retrieveLTM(
  opts: Omit<RetrieveOptions, "sources" | "stmHits">
): Promise<MemoryHit[]> {
  return retrieve({ ...opts, sources: "ltm" });
}

/**
 * Bounded re-rank: ask an LLM to pick the best `keep` of `window` candidates.
 *
 * The LLM only ever sees short id + one-line summaries — never full memory
 * contents — so the call is cheap and the output is schema-constrained.
 *
 * Returns the original hits in the model's preferred order, or the input
 * order unchanged if the call fails (fail-open).
 */
export async function rerankTopN(
  hits: MemoryHit[],
  query: string,
  keep: number,
  rerank: (input: { query: string; candidates: Array<{ id: string; summary: string }> }) => Promise<string[]>
): Promise<MemoryHit[]> {
  if (hits.length <= keep) return hits;

  const window = hits.slice(0, 15);
  const candidates = window.map((h) => ({
    id: h.id,
    summary: (h.section ? `${h.section}: ` : "") + h.content.slice(0, 120).replace(/\s+/g, " ").trim(),
  }));

  let ordered: string[];
  try {
    ordered = await rerank({ query, candidates });
  } catch {
    return hits.slice(0, keep);
  }

  if (!Array.isArray(ordered) || !ordered.length) return hits.slice(0, keep);

  const byId = new Map(window.map((h) => [h.id, h] as const));
  const ranked: MemoryHit[] = [];
  const seen = new Set<string>();

  for (const id of ordered) {
    const hit = byId.get(id);
    if (hit && !seen.has(id)) {
      ranked.push(hit);
      seen.add(id);
    }
  }

  // Any candidates the model didn't mention keep their original relative order.
  for (const hit of window) {
    if (!seen.has(hit.id) && ranked.length < keep) {
      ranked.push(hit);
      seen.add(hit.id);
    }
  }

  return ranked.slice(0, keep);
}