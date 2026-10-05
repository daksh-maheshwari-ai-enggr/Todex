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
 * Default: <project root>/public/working-dir
 * Override: set AGENT_WORKING_DIR (absolute, or relative to process.cwd()).
 */
export const WORKING_DIR = process.env.AGENT_WORKING_DIR
  ? path.resolve(process.cwd(), process.env.AGENT_WORKING_DIR)
  : path.resolve(process.cwd(), "public", "working-dir");

/** Create the working directory if it does not exist yet. */
export function ensureWorkingDir(): void {
  fs.mkdirSync(WORKING_DIR, { recursive: true });
}
