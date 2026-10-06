import "./env";
import fs from "fs";
import path from "path";

/**
 * The single source of truth for the agent's working directory.
 *
 * Every tool (filesystem, shell, git, todos, import graph, agent memory, RAG)
 * MUST import WORKING_DIR from here. Do not re-derive it per tool — doing so
 * is what previously caused bash, git, and file tools to operate on different
 * folders.
 *
 * Default: the directory todex was launched from, so `cd myproject && todex`
 * reads and writes `myproject` directly.
 * Override: `AGENT_WORKING_DIR` (absolute, or relative to process.cwd()) or
 * the `--dir` flag (applied in index.ts before this module is imported).
 */
export const WORKING_DIR = process.env.AGENT_WORKING_DIR
  ? path.resolve(process.cwd(), process.env.AGENT_WORKING_DIR)
  : process.cwd();

/** Create the working directory if it does not exist yet. */
export function ensureWorkingDir(): void {
  fs.mkdirSync(WORKING_DIR, { recursive: true });
}

/**
 * Create an agent metadata directory (`.agent`, `.agent-todos`, ...) and drop a
 * `.gitignore` inside it. A `*` ignore keeps the target project's `git status`
 * clean without editing the project's own `.gitignore`.
 */
export function ensureMetadataDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const ignoreFile = path.join(dir, ".gitignore");
  if (!fs.existsSync(ignoreFile)) {
    fs.writeFileSync(ignoreFile, "*\n");
  }
}
