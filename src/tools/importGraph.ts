import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { parse } from "@babel/parser";
import fs from "fs/promises";
import path from "path";
import { glob } from "glob";
import { WORKING_DIR } from "./fileSystem";

const AGENT_DIR = path.join(WORKING_DIR, ".agent");
const GRAPH_PATH = path.join(AGENT_DIR, "graph.json");

function resolveImport(fromFile: string, importPath: string) {
  if (!importPath.startsWith(".")) return null;
  const fromDir = path.dirname(fromFile);
  const resolved = path.join(fromDir, importPath);
  return resolved.replace(/\\/g, "/");
}

function resolveToActualFile(importedPath: string, allFiles: any) {
  const extensions = ["", ".js", ".ts", ".jsx", ".tsx", "/index.js", "/index.ts", "/index.jsx", "/index.tsx"];
  if (allFiles.has(importedPath)) return importedPath;
  for (const ext of extensions) {
    const candidate = importedPath + ext;
    if (allFiles.has(candidate)) return candidate;
  }
  return null;
}

function extractImports(content: string, ext: string) {
  const isTS = [".ts", ".tsx"].includes(ext);
  const isJSX = [".jsx", ".tsx"].includes(ext);
  try {
    const ast = parse(content, {
      sourceType: "module",
      errorRecovery: true,
      plugins: [
        ...(isTS ? ["typescript"] : []),
        ...(isJSX ? ["jsx"] : []),
        "decorators-legacy",
        "classProperties",
        "importMeta",
        "topLevelAwait",
      ] as any,
    });
    const imports: string[] = [];
    for (const node of ast.program.body) {
      if (node.type === "ImportDeclaration") imports.push(node.source.value);
      if ((node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") && node.source) {
        imports.push(node.source.value);
      }
      if (node.type === "ExpressionStatement") {
        const expr: any = node.expression;
        if (
          expr?.type === "CallExpression" &&
          expr.callee?.name === "require" &&
          expr.arguments?.[0]?.type === "StringLiteral"
        ) {
          imports.push(expr.arguments[0].value);
        }
      }
    }
    return imports;
  } catch {
    return [];
  }
}

async function buildGraph(files: string[]) {
  files = files.map((f) => f.replace(/\\/g, "/"));

  const fileSet = new Set(files);
  const graph: Record<string, any> = {};

  for (const file of files) graph[file] = { imports: [], importedBy: [], unresolvedImports: [] };

  for (const file of files) {
    let content: string;
    try {
      content = await fs.readFile(path.join(WORKING_DIR, file), "utf-8");
    } catch {
      continue;
    }

    const rawImports = extractImports(content, path.extname(file));

    for (const imp of rawImports) {
      if (!imp.startsWith(".")) {
        graph[file].unresolvedImports.push(imp);
        continue;
      }

      const relativePath = resolveImport(file, imp)?.replace(/\\/g, "/");
      if (!relativePath) continue;

      const actualFile = resolveToActualFile(relativePath, fileSet);
      if (actualFile) {
        if (!graph[file].imports.includes(actualFile)) graph[file].imports.push(actualFile);
        if (!graph[actualFile].importedBy.includes(file)) graph[actualFile].importedBy.push(file);
      } else {
        graph[file].unresolvedImports.push(imp);
      }
    }
  }

  return graph;
}

function analyzeGraph(graph: any) {
  const entries: string[] = [];
  const isolated: string[] = [];
  const central: any[] = [];
  for (const [file, node] of Object.entries(graph)) {
    const ibc = (node as any).importedBy.length;
    const ic = (node as any).imports.length;
    if (ibc === 0 && ic > 0) entries.push(file);
    if (ibc === 0 && ic === 0) isolated.push(file);
    if (ibc >= 3) central.push({ file, importedBy: ibc });
  }
  central.sort((a, b) => b.importedBy - a.importedBy);
  return {
    totalFiles: Object.keys(graph).length,
    entryPoints: entries,
    isolated,
    mostImported: central.slice(0, 10),
  };
}

export const buildImportGraphTool = tool(
  async ({ directory, file_pattern }) => {
    try {
      const base = directory ? path.join(WORKING_DIR, directory) : WORKING_DIR;
      const pattern = file_pattern ?? "**/*.{js,ts,jsx,tsx}";
      const files = await glob(pattern, {
        cwd: base,
        ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/*.min.js", "**/.agent/**"],
        nodir: true,
        absolute: false,
      });
      const relFiles = directory ? files.map((f) => path.join(directory, f).replace(/\\/g, "/")) : files;
      if (!relFiles.length) return `No JS/TS files found matching "${pattern}"`;

      const graph = await buildGraph(relFiles);
      const summary = analyzeGraph(graph);

      await fs.mkdir(AGENT_DIR, { recursive: true });
      await fs.writeFile(GRAPH_PATH, JSON.stringify({ graph, summary, builtAt: new Date().toISOString() }, null, 2));

      return [
        `✅ Import graph built — ${summary.totalFiles} files`,
        `📌 Entry points (${summary.entryPoints.length}): ${summary.entryPoints.slice(0, 10).join(", ")}`,
        `🔗 Most imported:`,
        ...summary.mostImported.map((m) => `   ${m.file} ← ${m.importedBy} files`),
        summary.isolated.length ? `🗑️ Isolated (${summary.isolated.length}): ${summary.isolated.slice(0, 5).join(", ")}` : "",
        `💾 Saved to .agent/graph.json`,
      ].join("\n");
    } catch (err: any) {
      return `❌ Import graph error: ${err.message}`;
    }
  },
  {
    name: "build_import_graph",
    description: "Build a full bidirectional import dependency graph for all JS/TS files. Identifies entry points, most imported files, and isolated files.",
    schema: z.object({
      directory: z.string().optional().describe("Subdirectory to scan (default: full project)"),
      file_pattern: z.string().optional().describe("Glob pattern (default: **/*.{js,ts,jsx,tsx})"),
    }),
  }
);

export const queryImportGraphTool = tool(
  async ({ file_path, direction, depth }) => {
    try {
      const { graph } = JSON.parse(await fs.readFile(GRAPH_PATH, "utf-8"));
      const target = graph[file_path]
        ? file_path
        : Object.keys(graph).find((k) => k.includes(file_path) || file_path.includes(path.basename(k, path.extname(k))));

      if (!target) return `"${file_path}" not found in graph. Run build_import_graph first.`;

      const node = graph[target];
      const dir = direction ?? "both";
      const dep = depth ?? 1;
      const lines = [`📄 ${target}`];

      if (dir === "imports" || dir === "both") {
        lines.push(`\n⬇️ Imports (${node.imports.length}):`);
        for (const d of node.imports) {
          lines.push(`   → ${d}`);
          if (dep > 1) for (const s of graph[d]?.imports ?? []) lines.push(`      → ${s}`);
        }
        if (node.unresolvedImports?.length)
          lines.push(`\n📦 External: ${node.unresolvedImports.slice(0, 8).join(", ")}`);
      }
      if (dir === "importedBy" || dir === "both") {
        lines.push(`\n⬆️ Imported by (${node.importedBy.length}):`);
        for (const d of node.importedBy) {
          lines.push(`   ← ${d}`);
          if (dep > 1) for (const s of graph[d]?.importedBy ?? []) lines.push(`      ← ${s}`);
        }
      }
      return lines.join("\n");
    } catch {
      return `No graph found. Run build_import_graph first.`;
    }
  },
  {
    name: "query_import_graph",
    description: "Look up a file in the import graph — shows its imports, what imports it, and external deps. Use before modifying a file to understand blast radius.",
    schema: z.object({
      file_path: z.string().describe("File path relative to working directory"),
      direction: z.enum(["imports", "importedBy", "both"]).optional(),
      depth: z.number().optional().describe("Traversal depth (default 1, max 3)"),
    }),
  }
);

export const impactAnalysisTool = tool(
  async ({ file_path }) => {
    try {
      const { graph } = JSON.parse(await fs.readFile(GRAPH_PATH, "utf-8"));
      if (!graph[file_path]) return `"${file_path}" not found. Run build_import_graph first.`;

      const visited = new Set<string>();
      const levels: Record<string, any> = {};
      let queue = [file_path];
      let level = 0;

      while (queue.length && level <= 10) {
        const next: string[] = [];
        for (const file of queue) {
          if (visited.has(file)) continue;
          visited.add(file);
          levels[file] = level;
          for (const dep of graph[file]?.importedBy ?? []) {
            if (!visited.has(dep)) next.push(dep);
          }
        }
        queue = next;
        level++;
      }

      visited.delete(file_path);
      if (!visited.size) return `✅ ${file_path} — no dependents. Safe to change.`;

      const byLevel: Record<string, any> = {};
      for (const [file, lvl] of Object.entries(levels)) {
        if (file === file_path) continue;
        (byLevel[lvl] = byLevel[lvl] ?? []).push(file);
      }

      const lines: any = [`⚠️ Impact analysis: ${file_path}`, `   ${visited.size} file(s) affected\n`];
      for (const [lvl, files] of Object.entries(byLevel)) {
        lines.push(`${lvl === "1" ? "Direct" : `Transitive depth ${lvl}`} (${files.length}):`);
        files.forEach((f: any) => lines.push(`  ${f}`));
        lines.push("");
      }
      return lines.join("\n");
    } catch {
      return `No graph found. Run build_import_graph first.`;
    }
  },
  {
    name: "impact_analysis",
    description: "Find ALL files affected if a given file changes — direct and transitive dependents. Use before modifying a file to understand blast radius.",
    schema: z.object({
      file_path: z.string().describe("File to analyze (relative to working directory)"),
    }),
  }
);

export const graphTools = [buildImportGraphTool, queryImportGraphTool, impactAnalysisTool];
