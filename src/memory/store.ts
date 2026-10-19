import fs from "node:fs";
import path from "node:path";
import { MEMORY_DIR, ensureMemoryDir } from "../workspace";
import type { STMRecord, LTMSection } from "./types";

/* ---------------------------------------------------------------------------
 * Paths
 * ------------------------------------------------------------------------ */

export function usersDir(userId: string): string {
  return path.join(MEMORY_DIR, "users", userId);
}

export function dailyDir(): string {
  return path.join(MEMORY_DIR, "daily");
}

export function modulesDir(): string {
  return path.join(MEMORY_DIR, "modules");
}

export function stmDir(): string {
  return path.join(MEMORY_DIR, "stm");
}

export function bm25Dir(): string {
  return path.join(MEMORY_DIR, "bm25");
}

export function indexPath(): string {
  return path.join(MEMORY_DIR, "index.md");
}

export function bm25Path(): string {
  return path.join(bm25Dir(), "index.json");
}

export function stmPath(sessionId: string): string {
  return path.join(stmDir(), `session_${sessionId}.json`);
}

export function dailyPath(date: string): string {
  return path.join(dailyDir(), `${date}.md`);
}

export function modulePath(name: string): string {
  return path.join(modulesDir(), `${name}.md`);
}

export function userProfilePath(userId: string): string {
  return path.join(usersDir(userId), "profile.md");
}

/* ---------------------------------------------------------------------------
 * Atomic writes
 * ------------------------------------------------------------------------ */

/** Write `content` to `filePath` atomically (temp + rename). */
export function atomicWrite(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
}

/** Read a file as UTF-8, or `null` when missing. */
export function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
 * LTM markdown files
 * ------------------------------------------------------------------------ */

const SECTION_RE = /^##\s+(.+?)\s*$/m;

/**
 * Split a markdown file into `{ heading, body }` sections.
 *
 * The preamble (before the first `##`) is reported with heading `"(preamble)"`.
 */
export function parseSections(content: string): Array<{
  heading: string;
  body: string;
}> {
  const lines = content.split(/\r?\n/);
  const sections: Array<{ heading: string; body: string }> = [];
  let heading = "(preamble)";
  let body: string[] = [];

  for (const line of lines) {
    const m = line.match(SECTION_RE);
    if (m) {
      sections.push({ heading, body: body.join("\n").trim() });
      heading = m[1].trim();
      body = [];
    } else {
      body.push(line);
    }
  }
  sections.push({ heading, body: body.join("\n").trim() });

  return sections.filter((s) => s.heading !== "(preamble)" || s.body.length > 0);
}

/**
 * Replace or append a section inside a markdown file.
 *
 * Mirrors the `safeSectionReplace` behaviour in
 * `src/tools/ProjectContextBuilder.ts`: sections are delimited by `## Heading`
 * and matched case-insensitively. When `append` is true the new content is
 * merged onto the existing section body rather than replacing it.
 */
export function upsertSection(
  content: string,
  section: string,
  newContent: string,
  append = false
): string {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "im");
  const match = re.exec(content);

  if (match) {
    const existing = match[1].trim();
    const merged = append && existing ? `${existing}\n${newContent}` : newContent;
    return content.replace(re, `## ${section}\n${merged}\n`);
  }

  return `${content.replace(/\s+$/, "")}\n\n## ${section}\n${newContent}\n`;
}

export function ensureLTMFile(filePath: string, template: string): string {
  ensureMemoryDir();
  const existing = readText(filePath);
  if (existing) return existing;
  atomicWrite(filePath, template);
  return template;
}

/* ---------------------------------------------------------------------------
 * STM (session JSON)
 * ------------------------------------------------------------------------ */

export function readSTM(sessionId: string): STMRecord | null {
  const raw = readText(stmPath(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as STMRecord;
  } catch {
    return null;
  }
}

export function writeSTM(record: STMRecord): void {
  atomicWrite(stmPath(record.sessionId), JSON.stringify(record, null, 2));
}

export function listSTMFiles(): string[] {
  try {
    return fs.readdirSync(stmDir()).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

/* ---------------------------------------------------------------------------
 * BM25 index (JSON)
 * ------------------------------------------------------------------------ */

export type BM25Doc = {
  terms: Record<string, number>;
  docLen: number;
  path: string;
  category: string;
  key: string;
  section: string;
  content: string;
};

export type BM25Index = {
  docs: Record<string, BM25Doc>;
  df: Record<string, number>;
  numDocs: number;
  avgDocLen: number;
};

export function readBM25Index(): BM25Index | null {
  const raw = readText(bm25Path());
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BM25Index;
  } catch {
    return null;
  }
}

export function writeBM25Index(index: BM25Index): void {
  atomicWrite(bm25Path(), JSON.stringify(index, null, 2));
}

/* ---------------------------------------------------------------------------
 * LTMSection <-> file
 * ------------------------------------------------------------------------ */

/** Materialise every section of an LTM file as retrievable `LTMSection`s. */
export function sectionsFromFile(
  relPath: string,
  category: LTMSection["category"],
  key: string
): LTMSection[] {
  const content = readText(path.join(MEMORY_DIR, relPath));
  if (!content) return [];

  return parseSections(content)
    .map((s, i) => ({
      id: `${relPath}::${i}`,
      path: relPath,
      key,
      section: s.heading,
      category,
      content: s.body,
    }))
    .filter((s) => s.content.trim().length > 0);
}