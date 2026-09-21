import { parse } from "@babel/parser";
import { Document } from "@langchain/core/documents";

const MAX_CHUNK_CHARS = 3000;
const CHARACTER_CHUNK_CHARS = 2000;

const JS_TS_EXTS = new Set([".js", ".ts", ".jsx", ".tsx"]);

type ChunkMetadata = {
  filePath: string;
  chunkIndex: number;
  chunkType: string;
  line?: number;
  label?: string;
};

type Chunk = {
  pageContent: string;
  metadata: ChunkMetadata;
};

function babelParse(content: string, ext: string) {
  const isTS = ext === ".ts" || ext === ".tsx";
  const isJSX = ext === ".jsx" || ext === ".tsx";

  return parse(content, {
    sourceType: "unambiguous",
    errorRecovery: true,
    plugins: [
      ...(isTS ? (["typescript"] as any[]) : []),
      ...(isJSX ? (["jsx"] as any[]) : []),
      "decorators-legacy",
      "classProperties",
      "classPrivateProperties",
      "classPrivateMethods",
      "importMeta",
      "topLevelAwait",
      "dynamicImport",
      "optionalChaining",
      "nullishCoalescingOperator",
    ] as any,
  });
}

function nodeSource(content: string, node: any): string {
  return content.slice(node.start, node.end);
}

function nodeLabel(node: any): string {
  switch (node.type) {
    case "FunctionDeclaration":
      return `function ${node.id?.name ?? "anonymous"}`;

    case "ClassDeclaration":
      return `class ${node.id?.name ?? "anonymous"}`;

    case "TSInterfaceDeclaration":
      return `interface ${node.id?.name ?? "anonymous"}`;

    case "TSTypeAliasDeclaration":
      return `type ${node.id?.name ?? "anonymous"}`;

    case "TSEnumDeclaration":
      return `enum ${node.id?.name ?? "anonymous"}`;

    case "ExportDefaultDeclaration":
      return "export default";

    case "ExportNamedDeclaration":
      return `export { ${(node.specifiers ?? [])
        .map((s: any) => s.exported?.name ?? s.exported?.value ?? "?")
        .join(", ")} }`;

    case "ExportAllDeclaration":
      return `export * from '${node.source?.value ?? ""}'`;

    case "VariableDeclaration": {
      const names = (node.declarations ?? [])
        .map((d: any) => d.id?.name ?? "?")
        .join(", ");
      return `${node.kind} ${names}`;
    }

    case "ImportDeclaration":
      return `import from '${node.source?.value ?? ""}'`;

    default:
      return node.type;
  }
}

function groupImports(body: any[], content: string): any[] {
  const chunks: any[] = [];
  let imports: any[] = [];

  const flushImports = () => {
    if (!imports.length) return;

    const source = imports
      .map((node) => nodeSource(content, node))
      .join("\n");

    chunks.push({
      label: "imports",
      source,
      line: imports[0].loc?.start?.line,
    });

    imports = [];
  };

  for (const node of body) {
    if (node.type === "ImportDeclaration") {
      imports.push(node);
      continue;
    }

    flushImports();
    chunks.push(null); // sentinel; process the actual node below
    chunks.push(node);
  }

  flushImports();
  return chunks;
}

/**
 * Split an oversized class into:
 *  1. class signature + constructor
 *  2. one chunk per method
 *
 * This keeps retrieval useful when a class is too large to fit into one
 * context chunk.
 */
function splitClassByMethods(
  content: string,
  classNode: any,
  filePath: string,
): Chunk[] {
  const className = classNode.id?.name ?? "anonymous";

  const methods = (classNode.body?.body ?? []).filter(
    (m: any) =>
      m.type === "ClassMethod" ||
      m.type === "ClassPrivateMethod" ||
      m.type === "TSDeclareMethod",
  );

  if (!methods.length) {
    return [
      {
        pageContent: nodeSource(content, classNode),
        metadata: {
          filePath,
          chunkIndex: 0,
          chunkType: "class",
          line: classNode.loc?.start?.line,
          label: `class ${className}`,
        },
      },
    ];
  }

  const chunks: Chunk[] = [];

  const constructor = methods.find((m: any) => m.kind === "constructor");

  const header = constructor
    ? content.slice(classNode.start, constructor.end) + "\n"
    : `class ${className} {\n`;

  if (header.trim()) {
    chunks.push({
      pageContent: header,
      metadata: {
        filePath,
        chunkIndex: chunks.length,
        chunkType: "class-header",
        line: classNode.loc?.start?.line,
        label: `class ${className}`,
      },
    });
  }

  for (const method of methods) {
    const source = nodeSource(content, method);

    if (!source.trim()) continue;

    chunks.push({
      pageContent: source,
      metadata: {
        filePath,
        chunkIndex: chunks.length,
        chunkType: method.kind === "constructor" ? "constructor" : "method",
        line: method.loc?.start?.line,
        label: `${className}.${method.key?.name ?? method.key?.value ?? "anonymous"}`,
      },
    });
  }

  return chunks;
}

/**
 * Split non-JS/TS or unparseable files on line boundaries.
 * It tries to keep each chunk near CHARACTER_CHUNK_CHARS without
 * cutting a line in half.
 */
function chunkByCharacters(content: string, filePath: string): Document[] {
  const lines = content.split(/\r?\n/);
  const chunks: string[] = [];
  let current: string[] = [];
  let charCount = 0;

  for (const line of lines) {
    const nextSize = charCount + line.length + 1;

    if (current.length && nextSize > CHARACTER_CHUNK_CHARS) {
      chunks.push(current.join("\n"));
      current = [];
      charCount = 0;
    }

    current.push(line);
    charCount += line.length + 1;
  }

  if (current.length) {
    chunks.push(current.join("\n"));
  }

  return chunks
    .filter((chunk) => chunk.trim().length > 0)
    .map(
      (chunk, i) =>
        new Document({
          pageContent: chunk,
          metadata: {
            filePath,
            chunkIndex: i,
            chunkType: "character",
            charCount: chunk.length,
          },
        }),
    );
}

function lineCount(text: string): number {
  return text.split(/\r?\n/).length;
}

function pushDocument(
  target: Document[],
  content: string,
  filePath: string,
  source: string,
  index: number,
  type: string,
  line?: number,
  label?: string,
) {
  const trimmed = source.trim();
  if (!trimmed) return;

  target.push(
    new Document({
      pageContent: trimmed,
      metadata: {
        filePath,
        chunkIndex: index,
        chunkType: type,
        ...(line ? { line } : {}),
        ...(label ? { label } : {}),
      },
    }),
  );
}

/**
 * AST-aware chunker for JS/TS.
 *
 * Chunks are created around semantic AST boundaries:
 * - grouped imports
 * - functions
 * - classes
 * - interfaces/types/enums
 * - exports
 * - top-level variables
 *
 * Oversized units are split by class methods or, as a final fallback,
 * by character/line boundaries.
 */
export function chunkFileByAST(
  content: string,
  filePath: string,
  ext: string,
): Document[] {
  const normalizedExt = ext.toLowerCase();

  if (!JS_TS_EXTS.has(normalizedExt)) {
    return chunkByCharacters(content, filePath);
  }

  let ast: any;

  try {
    ast = babelParse(content, normalizedExt);
  } catch {
    return chunkByCharacters(content, filePath);
  }

  const body: any[] = ast.program?.body ?? [];
  const grouped = groupImports(body, content);

  const rawChunks: Array<{
    label: string;
    source: string;
    line?: number;
    node?: any;
  }> = [];

  for (let i = 0; i < grouped.length; i++) {
    const item = grouped[i];

    if (!item) continue;

    if (item.source && !item.type) {
      rawChunks.push(item);
      continue;
    }

    if (!item.type) continue;

    rawChunks.push({
      label: nodeLabel(item),
      source: nodeSource(content, item),
      line: item.loc?.start?.line,
      node: item,
    });
  }

  const documents: Document[] = [];

  for (const raw of rawChunks) {
    const source = raw.source.trim();
    if (!source) continue;

    // A normal semantic unit fits in the chunk.
    if (source.length <= MAX_CHUNK_CHARS) {
      pushDocument(
        documents,
        content,
        filePath,
        source,
        documents.length,
        raw.label === "imports" ? "imports" : "ast",
        raw.line,
        raw.label,
      );
      continue;
    }

    // Large classes get method-level chunks.
    if (
      raw.node?.type === "ClassDeclaration" ||
      raw.node?.type === "ClassExpression"
    ) {
      const classChunks = splitClassByMethods(content, raw.node, filePath);

      for (const chunk of classChunks) {
        if (chunk.pageContent.length <= MAX_CHUNK_CHARS) {
          documents.push(
            new Document({
              pageContent: chunk.pageContent,
              metadata: {
                ...chunk.metadata,
                chunkIndex: documents.length,
              },
            }),
          );
        } else {
          // Extremely large methods/constructors still need a safe fallback.
          const fallback = chunkByCharacters(
            chunk.pageContent,
            filePath,
          );

          for (const doc of fallback) {
            documents.push(
              new Document({
                pageContent: doc.pageContent,
                metadata: {
                  ...doc.metadata,
                  chunkIndex: documents.length,
                  chunkType: "character-fallback",
                  parentChunkType: chunk.metadata.chunkType,
                  label: chunk.metadata.label,
                },
              }),
            );
          }
        }
      }

      continue;
    }

    // Large functions/types/exports: preserve the semantic label while
    // falling back to line-aware chunks.
    const fallback = chunkByCharacters(source, filePath);

    for (const doc of fallback) {
      documents.push(
        new Document({
          pageContent: doc.pageContent,
          metadata: {
            ...doc.metadata,
            chunkIndex: documents.length,
            chunkType: "character-fallback",
            parentChunkType: "ast",
            label: raw.label,
            sourceLine: raw.line,
          },
        }),
      );
    }
  }

  // Ensure stable sequential indexes after all splitting.
  return documents.map(
    (doc, index) =>
      new Document({
        pageContent: doc.pageContent,
        metadata: {
          ...doc.metadata,
          chunkIndex: index,
          lineCount: lineCount(doc.pageContent),
        },
      }),
  );
}
