import { CohereEmbeddings } from "@langchain/cohere";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";

/**
 * Multi-vector retrieval pipeline
 *
 * Flow:
 * 1. Similarity search on child chunks (small = precise semantic match)
 * 2. Collect unique parentIds from matched children
 * 3. Fetch the full parent chunks (large = rich context for the LLM)
 *
 * This gives us precision from children + context from parents.
 */

function getEmbeddings() {
  return new CohereEmbeddings({
    model: "embed-english-v3.0",
    apiKey: process.env.COHERE_API_KEY,
  });
}

async function getVectorStore(embeddings: any) {
  const pinecone = new PineconeClient({
    apiKey: process.env.PINECONE_API_KEY as string,
  });

  const index = pinecone.Index(process.env.PINECONE_INDEX as string);

  return PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex: index,
    maxConcurrency: 5,
  });
}

/**
 * Query the vector store with semantic search using child chunks first.
 *
 * @param {object} props
 * @param {string} props.userId
 * @param {string} [props.projectId]
 * @param {string} props.query
 * @param {number} [props.kChildren] - How many child chunks to search (default: 6)
 * @param {number} [props.kParents] - How many parent chunks to retrieve (default: 3)
 * @returns {{ query: string, retrievedDocs: Document[], childMatches: number }}
 */
export async function queryMultiVector({
  userId,
  projectId,
  query,
  kChildren = 6,
  kParents = 3,
}: Record<string, any>) {
  const embeddings = getEmbeddings();
  const vectorStore = await getVectorStore(embeddings);

  // ── Step 1: Find semantically similar child chunks ─────────────────────
  const childFilter = {
    docType: "child",
    userId,
    ...(projectId ? { projectId } : {}),
  };

  const childDocs = await vectorStore.similaritySearch(
    query,
    kChildren,
    childFilter
  );

  console.log(`[RAG] 🟢 Found ${childDocs.length} child matches`);

  if (childDocs.length === 0) {
    return { query, retrievedDocs: [], childMatches: 0 };
  }

  // ── Step 2: Collect unique parent IDs from matched children ────────────
  const parentIds = [
    ...new Set(
      childDocs
        .map((doc) => doc.metadata.parentId)
        .filter((id) => id != null)
    ),
  ];

  console.log(`[RAG] 🔵 Fetching ${parentIds.length} parent chunks`);

  // ── Step 3: Retrieve the full parent chunks ────────────────────────────
  const parentFilter = {
    docType: "parent",
    userId,
    source: { $in: parentIds },
    ...(projectId ? { projectId } : {}),
  };

  const retriever = vectorStore.asRetriever({
    k: kParents,
    filter: parentFilter,
  });

  const retrievedDocs = await retriever.invoke(query);

  console.log(`[RAG] ✅ Retrieved ${retrievedDocs.length} parent documents`);

  return {
    query,
    retrievedDocs,
    childMatches: childDocs.length,
  };
}
