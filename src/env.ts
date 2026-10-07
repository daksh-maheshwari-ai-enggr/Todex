import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { getApiKey } from "./config";

/**
 * Load provider credentials into `process.env`.
 *
 * Credentials are stored globally (`~/.config/todex/config.json`, managed by
 * `src/config.ts`), so users never have to create a project `.env` just to run
 * todex. Environment variables are still honoured as a development override.
 *
 * `.env` loading is now optional and only serves that override workflow:
 * dotenv reads the local `.env` first (letting a project override defaults) and
 * then the `.env` shipped next to the installed package. dotenv never
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

/**
 * Pull the globally-saved API key into `process.env`.
 *
 * Runs at import time and can be re-run after the first-run setup screen saves
 * a key. Existing environment variables always win, so this is a fallback
 * rather than an override.
 */
export function applyGlobalCredentials(): void {
  const apiKey = getApiKey();
  if (apiKey && !process.env.FREELLMAPI_API_KEY) {
    process.env.FREELLMAPI_API_KEY = apiKey;
  }
}

applyGlobalCredentials();
