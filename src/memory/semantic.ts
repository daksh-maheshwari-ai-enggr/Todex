import { CohereEmbeddings } from "@langchain/cohere";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { Document } from "@langchain/core/documents";

import type { LTMSection, MemoryHit } from "./types";

/**
 * Semantic half of the hybrid retriever.
 *
 * Reuses the same Cohere + Pinecone credentials as `src/rag/`, but stores
 * memory sections in their own namespace (`docType: "memory"` + a fixed
 * `projectId`) so they never collide with codebase AST chunks.
 *
 * Everything here fails soft: when the keys are absent the caller degrades
 * to BM25-only instead of crashing the turn.
 */

export const MEMORY_NAMESPACE = "todex-memory";

function getEmbeddings() {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error("COHERE_API_KEY is not configured");

  return new CohereEmbeddings({
    model: "embed-english-v3.0",
    apiKey,
  });
}

async function getVectorStore(embeddings: any): Promise<any> {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX;

  if (!apiKey) throw new Error("PINECONE_API_KEY is not configured");
  if (!indexName) throw new Error("PINECONE_INDEX is not configured");

  const pinecone = new PineconeClient({ apiKey });
  const index = pinecone.Index(indexName);

  return new PineconeStore(embeddings, {
    pineconeIndex: index,
    maxConcurrency: 5,
  });
}

/** True when both embedding providers are configured. Never throws. */
export function semanticAvailable(): boolean {
  return Boolean(
    process.env.COHERE_API_KEY &&
      process.env.PINECONE_API_KEY &&
      process.env.PINECONE_INDEX
  );
}

function toDocuments(sections: LTMSection[], userId: string): Document[] {
  return sections.map(
    (s) =>
      new Document({
        // Prefix the heading so title terms carry into the embedding.
        pageContent: `${s.section}\n${s.content}`,
        metadata: {
          docType: "memory",
          projectId: MEMORY_NAMESPACE,
          userId,
          memId: s.id,
          category: s.category,
          key: s.key,
          section: s.section,
          path: s.path,
        },
      })
  );
}

/** Upsert memory sections into the vector store. */
export async function embedMemorySections({
  sections,
  userId,
}: {
  sections: LTMSection[];
  userId: string;
}): Promise<{ embedded: number }> {
  if (!sections.length) return { embedded: 0 };

  const embeddings = getEmbeddings();
  const store = await getVectorStore(embeddings);

  // Replace-in-place so edits do not accumulate duplicate vectors.
  const namespacePrefix = `${MEMORY_NAMESPACE}:${userId}:`;
  const ids = sections.map((s) => `${namespacePrefix}${s.id}`);

  try {
    await (store as any).deleteKeys?.(ids);
  } catch {
    // First write — nothing to delete.
  }

  const docs = toDocuments(sections, userId).map((doc, i) => {
    (doc.metadata as any).vectorId = ids[i];
    return doc;
  });

  await store.addDocuments(docs as any);

  return { embedded: docs.length };
}

/** Remove embedded memory sections for a path (used when a file is dropped). */
export async function deleteMemoryVectors({
  ids,
  userId,
}: {
  ids: string[];
  userId: string;
}): Promise<void> {
  if (!ids.length) return;

  const embeddings = getEmbeddings();
  const store = await getVectorStore(embeddings);
  const prefix = `${MEMORY_NAMESPACE}:${userId}:`;

  await (store as any).deleteKeys?.(ids.map((id) => `${prefix}${id}`));
}

/**
 * Semantic search over memory sections.
 *
 * Returns `MemoryHit`s carrying the raw similarity score, or an empty array
 * when the store is unavailable or empty.
 */
export async function queryMemorySemantic({
  query,
  userId,
  k = 10,
  category,
}: {
  query: string;
  userId: string;
  k?: number;
  category?: string;
}): Promise<MemoryHit[]> {
  if (!semanticAvailable()) return [];

  try {
    const embeddings = getEmbeddings();
    const store = await getVectorStore(embeddings);

    const filter: Record<string, any> = {
      docType: "memory",
      projectId: MEMORY_NAMESPACE,
      userId,
      ...(category ? { category } : {}),
    };

    const docs = await store.similaritySearch(query, k, filter) as Document[];

    return docs.map((doc: Document) => {
      const md = doc.metadata ?? {};
      return {
        id: String(md.memId ?? md.path ?? "semantic"),
        source: "ltm",
        category: md.category,
        key: md.key,
        section: md.section,
        path: md.path,
        content: doc.pageContent || "",
        // Pinecone returns cosine similarity in [0, 1].
        score: typeof (doc as any).score === "number" ? (doc as any).score : 0.5,
        semantic: typeof (doc as any).score === "number" ? (doc as any).score : 0.5,
      };
    });
  } catch (err: any) {
    console.warn(`[Memory] semantic search unavailable: ${err?.message ?? err}`);
    return [];
  }
}
