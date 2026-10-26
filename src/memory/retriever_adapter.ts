import { BaseRetriever } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";

import { buildIndex } from "./bm25";
import { readBM25Index, writeBM25Index } from "./store";
import { readLTMSections, resolveUserId } from "./ltm";
import { retrieve } from "./retriever";
import type { MemoryHit } from "./types";

/**
 * A LangChain `BaseRetriever` over the memory layer.
 *
 * Wrapping the hybrid retriever in the standard interface gives it everything
 * the rest of the harness takes for granted: `.invoke()`, callback handlers,
 * tags/metadata, LangSmith tracing, and seamless use inside `createAgent`
 * graphs. The merge logic (BM25 40 + semantic 60) is unchanged.
 */

export type BM25Index = NonNullable<ReturnType<typeof readBM25Index>>;

export type MemoryRetrieverOptions = {
  userId?: string;
  limit?: number;
  category?: string;
  key?: string;
  sources?: "both" | "ltm" | "stm";
  model?: BaseLanguageModel;
  /** Optional pre-built BM25 index; rebuilt from markdown when absent. */
  bm25Index?: BM25Index | null;
};

export class MemoryRetriever extends BaseRetriever<Record<string, unknown>> {
  lc_namespace: string[] = ["todex", "memory"];

  private userId: string;
  private limit: number;
  private category?: string;
  private key?: string;
  private sources: "both" | "ltm" | "stm";
  private model?: BaseLanguageModel;
  private bm25Index: BM25Index | null;

  constructor(options: MemoryRetrieverOptions = {}) {
    super();
    this.userId = options.userId ?? resolveUserId();
    this.limit = options.limit ?? 8;
    this.category = options.category;
    this.key = options.key;
    this.sources = options.sources ?? "both";
    this.model = options.model;
    this.bm25Index = options.bm25Index ?? null;

    this.metadata = {
      source: "todex-memory",
      userId: this.userId,
    };
    this.tags = ["memory", "retrieval"];
  }

  private ensureIndex(): BM25Index {
    if (this.bm25Index) return this.bm25Index;
    writeBM25Index(buildIndex(readLTMSections()));
    this.bm25Index = readBM25Index();
    return this.bm25Index as BM25Index;
  }

  async _getRelevantDocuments(
    query: string,
    _callbacks?: any
  ): Promise<Document<any>[]> {
    const index = this.ensureIndex();
    const hits = await retrieve({
      query,
      userId: this.userId,
      limit: this.limit,
      category: this.category,
      key: this.key,
      sources: this.sources,
      bm25Index: index,
    });

    return hits.map(
      (hit) =>
        new Document({
          pageContent: hit.content,
          metadata: {
            id: hit.id,
            source: hit.source,
            category: hit.category,
            key: hit.key,
            section: hit.section,
            path: hit.path,
            score: hit.score,
            bm25: hit.bm25,
            semantic: hit.semantic,
          },
        })
    );
  }
}

/**
 * Build a memory retriever bound to a user/session.
 *
 * `model` is optional — reserved for the bounded re-rank step and not used by
 * the default retriever.
 */
export function createMemoryRetriever(
  options: MemoryRetrieverOptions = {}
): MemoryRetriever {
  return new MemoryRetriever(options);
}

/** Convenience: retrieve memory hits directly (no graph wiring). */
export async function recall(
  query: string,
  options: Omit<MemoryRetrieverOptions, "userId"> & { userId?: string } = {}
): Promise<MemoryHit[]> {
  const retriever = createMemoryRetriever(options);
  const docs = await retriever.invoke(query);
  return docs.map((doc) => ({
    id: String(doc.metadata.id ?? "hit"),
    source: (doc.metadata.source as "stm" | "ltm") ?? "ltm",
    category: doc.metadata.category as any,
    key: doc.metadata.key as string | undefined,
    section: doc.metadata.section as string | undefined,
    path: doc.metadata.path as string | undefined,
    content: doc.pageContent,
    score: Number(doc.metadata.score ?? 0),
    bm25: Number(doc.metadata.bm25 ?? 0),
    semantic: Number(doc.metadata.semantic ?? 0),
  }));
}