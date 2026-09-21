import { CohereEmbeddings } from "@langchain/cohere";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { v4 as uuidv4 } from "uuid";
import path from "path";

import { chunkFileByAST } from "./chunker.js";

type InputFile = {
  path: string;
  content: string;
};

type ParentDocument = {
  pageContent: string;
  metadata: Record<string, any>;
};

function getEmbeddings() {
  const apiKey = process.env.COHERE_API_KEY;

  if (!apiKey) {
    throw new Error("COHERE_API_KEY is not configured");
  }

  return new CohereEmbeddings({
    model: "embed-english-v3.0",
    apiKey,
  });
}

async function getPineconeStore(embeddings: any) {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX;

  if (!apiKey) {
    throw new Error("PINECONE_API_KEY is not configured");
  }

  if (!indexName) {
    throw new Error("PINECONE_INDEX is not configured");
  }

  const pinecone = new PineconeClient({ apiKey });
  const index = pinecone.Index(indexName);

  return new PineconeStore(embeddings, {
    pineconeIndex: index,
    maxConcurrency: 5,
  });
}

/**
 * Split a large parent document into smaller children for retrieval.
 *
 * Parent chunks stay intact for context reconstruction while child chunks
 * provide smaller searchable units.
 */
function createChildrenFromParent(
  parentDoc: ParentDocument,
  parentId: string,
): ParentDocument[] {
  const lines = parentDoc.pageContent.split(/\r?\n/);

  if (lines.length <= 1) {
    const midpoint = Math.ceil(parentDoc.pageContent.length / 2);

    return [
      parentDoc.pageContent.slice(0, midpoint),
      parentDoc.pageContent.slice(midpoint),
    ]
      .map((pageContent, i) => pageContent.trim())
      .filter(Boolean)
      .map((pageContent, i) => ({
        pageContent,
        metadata: {
          ...parentDoc.metadata,
          docType: "child",
          parentId,
          chunkId: `child-${parentId}-${i}`,
          source: `child-${parentId}-${i}`,
          chunkIndex: i,
        },
      }));
  }

  // Keep children roughly balanced while avoiding empty chunks.
  const mid = Math.ceil(lines.length / 2);

  return [lines.slice(0, mid).join("\n"), lines.slice(mid).join("\n")]
    .filter((half) => half.trim().length > 0)
    .map((half, i) => ({
      pageContent: half,
      metadata: {
        ...parentDoc.metadata,
        docType: "child",
        parentId,
        chunkId: `child-${parentId}-${i}`,
        source: `child-${parentId}-${i}`,
        chunkIndex: i,
      },
    }));
}

export async function embedFilesWithAST({
  files,
  userId,
  projectId = "default",
}: {
  files: InputFile[];
  userId: string;
  projectId?: string;
}): Promise<Record<string, any>> {
  if (!Array.isArray(files) || files.length === 0) {
    return {
      fileChunkMap: {},
      parentCount: 0,
      childCount: 0,
      total: 0,
    };
  }

  if (!userId?.trim()) {
    throw new Error("userId is required");
  }

  const embeddings = getEmbeddings();
  const vectorStore = await getPineconeStore(embeddings);

  const parentDocs: ParentDocument[] = [];
  const childDocs: ParentDocument[] = [];
  const fileChunkMap: Record<string, number> = {};

  for (const file of files) {
    if (!file?.path || typeof file.content !== "string") {
      console.warn("[RAG] Skipping invalid file entry");
      continue;
    }

    const filePath = file.path;
    const ext = path.extname(filePath).toLowerCase();

    const chunks = chunkFileByAST(file.content, filePath, ext);

    fileChunkMap[filePath] = chunks.length;

    for (const chunk of chunks) {
      const parentId = uuidv4();

      const parentDoc: ParentDocument = {
        pageContent: chunk.pageContent,
        metadata: {
          ...chunk.metadata,
          docType: "parent",
          chunkId: parentId,
          parentId,
          source: parentId,
          userId,
          projectId,
        },
      };

      parentDocs.push(parentDoc);

      // Keep the original parent for context reconstruction.
      // Only create children for larger chunks to avoid unnecessary vectors.
      if (chunk.pageContent.length > 600) {
        const children = createChildrenFromParent(parentDoc, parentId).map(
          (child) => ({
            ...child,
            metadata: {
              ...child.metadata,
              userId,
              projectId,
              filePath,
            },
          }),
        );

        childDocs.push(...children);
      }
    }

    console.log(
      `[RAG] ${filePath} -> ${chunks.length} AST chunks, ` +
        `${childDocs.filter((d) => d.metadata.filePath === filePath).length} children`,
    );
  }

  const documentsToUpsert = [...parentDocs, ...childDocs];

  if (documentsToUpsert.length === 0) {
    return {
      fileChunkMap,
      parentCount: 0,
      childCount: 0,
      total: 0,
    };
  }

  console.log(
    `[RAG] Upserting ${parentDocs.length} parents + ` +
      `${childDocs.length} children...`,
  );

  await vectorStore.addDocuments(documentsToUpsert as any);

  console.log("[RAG] Done");

  return {
    fileChunkMap,
    parentCount: parentDocs.length,
    childCount: childDocs.length,
    total: documentsToUpsert.length,
  };
}
