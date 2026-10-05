#!/usr/bin/env node
import "dotenv/config";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { render } from "ink";
import React from "react";
import { App } from "./App.js";
import { store } from "./state/store.js";
import { setInjectedBackend } from "./utils/agent.js";
import type { TuiBackend } from "./types/types.js";

/**
 * Start the full-screen TUI.
 *
 * @param backend agent bridge injected by the root launcher (`todex --tui`).
 *                Omitted when the TUI is started directly — the store then
 *                falls back to importing the root sources at runtime.
 */
export async function startTui(backend?: TuiBackend): Promise<void> {
  setInjectedBackend(backend ?? null);
  store.reset();
  store.configure(backend ?? null);

  const instance = render(<App />, { exitOnCtrlC: true });
  store.setExit(() => instance.unmount());
  void store.bootstrap();

  await instance.waitUntilExit();
}

/** True when this file is the process entry (npm run dev / node dist). */
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  startTui().catch((err: any) => {
    console.error("❌ TUI failed:", err?.message ?? err);
    process.exit(1);
  });
}
