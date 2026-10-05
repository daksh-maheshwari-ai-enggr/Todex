import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

/**
 * Load provider credentials into `process.env`.
 *
 * dotenv's shorthand (`import "dotenv/config"`) only reads `.env` from
 * `process.cwd()`. That breaks as soon as todex is installed/linked globally:
 * running `todex` from any other project finds no keys, `resolveProviderChain()`
 * comes back empty, and the first chat fails with "No model provider
 * configured."
 *
 * So we read the local `.env` first (letting a project override the defaults)
 * and then the `.env` shipped next to the installed package. dotenv never
 * overwrites variables that are already set, so the first file wins per key.
 *
 * `__dirname` is `dist/` in a compiled install and `src/` under tsx, so `..`
 * points at the package root in both cases.
 */
const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "..", ".env"),
];

const seen = new Set<string>();

for (const file of candidates) {
  if (seen.has(file) || !fs.existsSync(file)) continue;
  seen.add(file);
  // `quiet` keeps dotenv's "◇ injected env" banner out of the TUI/stdout.
  dotenv.config({ path: file, quiet: true });
}
