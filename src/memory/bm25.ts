import type { LTMSection, MemoryHit } from "./types";
import type { BM25Index, BM25Doc } from "./store";

/**
 * Local BM25 (Okapi) over LTM sections.
 *
 * No external dependency, no API call, fully deterministic — this is the
 * lexical half of the hybrid retriever. The index is rebuilt from markdown
 * on demand and cached on disk as JSON (see `store.readBM25Index`).
 */

const K1 = 1.5;
const B = 0.75;

/** Stopwords are trimmed from both the index and the query. */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "than", "so", "as",
  "of", "to", "in", "on", "at", "by", "for", "with", "from", "is", "are",
  "was", "were", "be", "been", "being", "do", "does", "did", "have", "has",
  "had", "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
  "us", "them", "my", "your", "his", "its", "our", "their", "this", "that",
  "these", "those", "not", "no", "yes", "will", "would", "can", "could",
  "should", "there", "here", "what", "when", "where", "which", "who",
]);

/** Split into lowercase term tokens. */
export function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function termFreqs(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
  return tf;
}

/** Build a fresh in-memory index from every LTM section. */
export function buildIndex(sections: LTMSection[]): BM25Index {
  const docs: Record<string, BM25Doc> = {};
  const df: Record<string, number> = {};
  let totalLen = 0;

  for (const s of sections) {
    // Weight the heading like two extra occurrences of each of its terms.
    const tokens = [...tokenize(s.content), ...tokenize(s.section), ...tokenize(s.section)];
    const tf = termFreqs(tokens);

    const doc: BM25Doc = {
      terms: tf,
      docLen: tokens.length,
      path: s.path,
      category: s.category,
      key: s.key,
      section: s.section,
      content: s.content,
    };

    docs[s.id] = doc;
    totalLen += tokens.length;

    for (const term of Object.keys(tf)) {
      df[term] = (df[term] ?? 0) + 1;
    }
  }

  const numDocs = Object.keys(docs).length;

  return {
    docs,
    df,
    numDocs,
    avgDocLen: numDocs ? totalLen / numDocs : 0,
  };
}

/**
 * Score every document against the query and return the top `limit` hits.
 *
 * Returns raw BM25 scores; normalization happens in the hybrid merge.
 */
export function searchBM25(
  index: BM25Index,
  query: string,
  limit = 10,
  filter?: { category?: string; key?: string }
): MemoryHit[] {
  const queryTerms = tokenize(query);
  if (!queryTerms.length || !index.numDocs) return [];

  const scores: Array<{ id: string; score: number }> = [];

  for (const [id, doc] of Object.entries(index.docs)) {
    if (filter?.category && doc.category !== filter.category) continue;
    if (filter?.key && doc.key !== filter.key) continue;

    let score = 0;

    for (const term of queryTerms) {
      const tf = doc.terms[term];
      if (!tf) continue;

      const n = index.df[term] ?? 0;
      const idf = Math.log(1 + (index.numDocs - n + 0.5) / (n + 0.5));
      const norm =
        tf * (K1 + 1) /
        (tf + K1 * (1 - B + (B * doc.docLen) / (index.avgDocLen || 1)));

      score += idf * norm;
    }

    if (score > 0) scores.push({ id, score });
  }

  scores.sort((a, b) => b.score - a.score);

  return scores.slice(0, limit).map(({ id, score }) => {
    const doc = index.docs[id];
    return {
      id,
      source: "ltm" as const,
      category: doc.category as LTMSection["category"],
      key: doc.key,
      section: doc.section,
      path: doc.path,
      content: doc.content,
      score,
      bm25: score,
    };
  });
}