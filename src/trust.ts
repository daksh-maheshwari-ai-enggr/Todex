import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { WORKING_DIR, ensureMetadataDir } from "./workspace";

const AGENT_DIR = path.join(WORKING_DIR, ".agent");
const TRUST_FILE = path.join(AGENT_DIR, ".trusted");

/** Has this project already been approved by the user? */
function isTrusted(): boolean {
  try {
    return fs.existsSync(TRUST_FILE);
  } catch {
    return false;
  }
}

function markTrusted(): void {
  ensureMetadataDir(AGENT_DIR);
  fs.writeFileSync(TRUST_FILE, `${new Date().toISOString()}\n`);
}

export interface ConfirmOptions {
  /** `--yes` was passed — skip the prompt. */
  yes?: boolean;
  /** Directory the agent will operate on (defaults to WORKING_DIR). */
  dir?: string;
}

/**
 * One-time, per-project confirmation before the agent reads and writes a real
 * project.
 *
 * Skipped when: `--yes` was passed, stdin/stdout is not a TTY (scripts and piped
 * runs), the project was already approved (`.agent/.trusted` exists), or the
 * directory is empty and has no `.git`.
 */
export async function confirmWorkspace(
  opts: ConfirmOptions = {}
): Promise<boolean> {
  if (opts.yes || isTrusted()) return true;

  const dir = opts.dir ?? WORKING_DIR;

  // Non-interactive runs can't answer a prompt — proceed without blocking.
  if (!process.stdin.isTTY || !process.stdout.isTTY) return true;

  let entries: string[];
  try {
    entries = fs.readdirSync(dir).filter((name) => !name.startsWith(".agent"));
  } catch {
    return true; // Nothing readable to protect.
  }

  const emptyScratchDir =
    entries.length === 0 && !fs.existsSync(path.join(dir, ".git"));
  if (emptyScratchDir) return true;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = (
      await rl.question(
        `\n⚠️  todex will read and write files in:\n` +
          `    ${dir}\n` +
          `    Continue? [y/N] `
      )
    )
      .trim()
      .toLowerCase();

    if (answer === "y" || answer === "yes") {
      markTrusted();
      return true;
    }
    return false;
  } finally {
    rl.close();
  }
}
