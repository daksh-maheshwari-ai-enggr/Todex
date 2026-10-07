#!/usr/bin/env node

// Must load before workspace-aware modules.
import "./bootstrap";

import { confirmWorkspace } from "./trust";

import { HumanMessage } from "@langchain/core/messages";
import { createCodingAgent } from "./agent";
import { hasApiKey, saveApiKey } from "./config";
import {
  runAgentTurn,
  trimHistory,
  renderToolManifest,
  describeModelChain,
} from "./runtime";

const VERSION = process.env.VERSION || "1.0.0";

const HELP_TEXT = `Todex CLI v${VERSION}

Usage:
  todex                      Open the Todex TUI
  todex --dir <path>         Run against a different working directory
  todex --yes                Skip project confirmation

Options:
  --dir <path>               Override AGENT_WORKING_DIR
  --yes, -y                  Skip the first-run project confirmation
  --version, -v              Print the version
  --help, -h                 Show this help
`;

function parseFlags(argv: string[]): {
  yes: boolean;
  help: boolean;
} {
  let yes = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case "--help":
      case "-h":
        help = true;
        break;

      case "--yes":
      case "-y":
        yes = true;
        break;

      case "--version":
      case "-v":
        console.log(`Todex CLI v${VERSION}`);
        process.exit(0);
        break;

      case "--dir": {
        const value = argv[++i];

        if (!value) {
          console.error("❌ --dir requires a path argument");
          process.exit(1);
        }

        process.env.AGENT_WORKING_DIR = value;
        break;
      }

      default:
        // The Ink TUI handles user input.
        // Positional prompts are intentionally ignored here.
        break;
    }
  }

  return { yes, help };
}

async function main() {
  const { yes, help } = parseFlags(process.argv.slice(2));

  if (help) {
    console.log(HELP_TEXT);
    return;
  }

  // One-time, per-project confirmation before touching the workspace.
  if (!(await confirmWorkspace({ yes }))) {
    console.log("Aborted — no files were changed.");
    process.exit(1);
  }

  /*
   * The Ink CLI is now the main Todex CLI.
   *
   * Production:
   *   node dist/index.js
   *   → cli/dist/index.js
   *
   * Development:
   *   tsx src/index.ts
   *   → cli/src/index.tsx
   */


  // @ts-expect-error cli is compiled as a separate package
  const tui = await import("../cli/dist/index.js");
  

  if (typeof tui.startTui !== "function") {
    throw new Error(
      "Todex TUI entry point was found, but startTui() is missing."
    );
  }

  /*
   * The boot-time global config (see `./env` / `./config`) has already loaded
   * any saved API key into the environment. If none exists, the TUI shows its
   * first-run setup screen before the agent is ever built — `createCodingAgent`
   * is only called lazily from the store once a turn is submitted, so a missing
   * provider can no longer surface as a hard startup failure.
   */
  await tui.startTui({
    createCodingAgent,
    runAgentTurn,
    trimHistory,
    renderToolManifest,
    describeModelChain,
    HumanMessage,
    hasApiKey,
    saveApiKey,
  });
}


main().catch((err) => {
  console.error("\n❌ Fatal:", err?.message ?? err);
  process.exit(1);
});

