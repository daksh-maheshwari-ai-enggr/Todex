import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  ensureMemoryDir,
  usersDir,
  dailyDir,
  modulesDir,
  indexPath,
  dailyPath,
  modulePath,
  userProfilePath,
  readText,
  atomicWrite,
  upsertSection,
  sectionsFromFile,
} from "./store";
import type { LTMSection, MemoryCategory } from "./types";

/* ---------------------------------------------------------------------------
 * User identity
 * ------------------------------------------------------------------------ */

/**
 * Resolve the current user id.
 *
 * Auth is not wired yet — when it lands this is the single place to swap.
 * Priority: TODEX_USER_ID env var → git user.name → git user.email → whoami.
 */
export function resolveUserId(): string {
  const env = process.env.TODEX_USER_ID;
  if (env && env.trim()) return env.trim();

  for (const cmd of [
    ["git", ["config", "user.name"]],
    ["git", ["config", "user.email"]],
  ] as const) {
    try {
      const out = execFileSync(cmd[0], cmd[1], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (out) return out.replace(/\s+/g, "-").toLowerCase();
    } catch {
      // continue
    }
  }

  try {
    const out = execFileSync("whoami", [], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (out) return out;
  } catch {
    // ignore
  }

  return "default";
}

/* ---------------------------------------------------------------------------
 * LTM write
 * ------------------------------------------------------------------------ */

export type WriteLTMInput = {
  category: MemoryCategory;
  key: string;
  section: string;
  content: string;
  append?: boolean;
  userId: string;
};

/**
 * Persist a fact to LTM.
 *
 * - `user`  → `.memory/users/<key>/profile.md`
 * - `daily` → `.memory/daily/<YYYYMMDD>.md`
 * - `module`→ `.memory/modules/<key>.md`
 * - `index` → `.memory/index.md`
 */
export function writeLTM(input: WriteLTMInput): LTMSection {
  ensureMemoryDir();
  const { category, key, section, content, append = false } = input;

  let filePath: string;
  switch (category) {
    case "user":
      filePath = userProfilePath(key);
      break;
    case "daily":
      filePath = dailyPath(key);
      break;
    case "module":
      filePath = modulePath(key);
      break;
    case "index":
      filePath = indexPath();
      break;
  }

  const existing = readText(filePath) ?? "";
  const updated = upsertSection(existing, section, content, append);
  atomicWrite(filePath, updated);

  return {
    id: `${category}:${key}:${section}`,
    path: path.relative(path.dirname(filePath), filePath),
    key,
    section,
    category,
    content,
  };
}

/* ---------------------------------------------------------------------------
 * LTM read
 * ------------------------------------------------------------------------ */

export function readLTMSections(
  category?: MemoryCategory,
  key?: string
): LTMSection[] {
  ensureMemoryDir();
  const out: LTMSection[] = [];

  const add = (relPath: string, cat: MemoryCategory, k: string) => {
    out.push(...sectionsFromFile(relPath, cat, k));
  };

  if (!category || category === "index") add("index.md", "index", "index");

  if (!category || category === "module") {
    try {
      for (const f of fs.readdirSync(modulesDir())) {
        if (f.endsWith(".md")) add(`modules/${f}`, "module", f.replace(/\.md$/, ""));
      }
    } catch {
      // no modules yet
    }
  }

  if (!category || category === "daily") {
    try {
      for (const f of fs.readdirSync(dailyDir())) {
        if (f.endsWith(".md")) add(`daily/${f}`, "daily", f.replace(/\.md$/, ""));
      }
    } catch {
      // no daily logs yet
    }
  }

  if (!category || category === "user") {
    try {
      for (const uid of fs.readdirSync(usersDir("x"))) {
        const profile = path.join(usersDir(uid), "profile.md");
        if (fs.existsSync(profile)) add(`users/${uid}/profile.md`, "user", uid);
      }
    } catch {
      // no users yet
    }
  }

  if (key) return out.filter((s) => s.key === key);
  return out;
}

/** Today's date as YYYYMMDD. */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}