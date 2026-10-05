#!/usr/bin/env node
import "./env";
import { HumanMessage } from "@langchain/core/messages";
import { createCodingAgent } from "./agent";
import { runCli, runAgentTurn, startTui } from "./cli";

const VERSION = process.env.VERSION || "1.0.0";

/* ---------------------------------------------------------------------------
 * Flag parsing — flags are consumed here so whatever remains is the prompt.
 * ------------------------------------------------------------------------- */

const HELP_TEXT = `Toodex CLI v${VERSION}

Usage:
  todex                      Interactive REPL (original terminal interface)
  todex "do something"       One-shot request
  todex --tui                Full-screen TUI (Ink) interface
  todex --dir <path> ...     Run against a different working directory

Options:
  --tui                      Start the alternate full-screen TUI
  --dir <path>               Override AGENT_WORKING_DIR
  --version                  Print the version
  --help                     Show this help

REPL commands:
  /help /tools /model /history /clear /exit
`;

function parseFlags(argv: string[]): { prompt: string[]; help?: boolean } {
  const prompt: string[] = [];
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        help = true;
        break;
      case "--version":
      case "-v":
        console.log(`Toodex CLI v${VERSION}`);
        process.exit(0);
        break;
      case "--tui":
        // Handled in main() — skip the valueless flag here.
        prompt.push(arg);
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
        prompt.push(arg);
    }
  }

  return { prompt, help };
}

const { prompt: promptArgs, help } = parseFlags(process.argv.slice(2));

if (help) {
  console.log(HELP_TEXT);
  process.exit(0);
}

async function main() {
  // `todex --tui` → alternate full-screen interface.
  if (promptArgs[0] === "--tui") {
    await startTui();
    return;
  }

  const prompt = promptArgs.join(" ").trim();

  // One-shot: `todex "fix the failing test"` / `npm run dev -- "..."`
  if (prompt) {
    const agent = createCodingAgent();
    await runAgentTurn(agent, [new HumanMessage(prompt)]);
    process.stdout.write("\n");
    return;
  }

  // No prompt → interactive REPL.
  await runCli();
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err?.message ?? err);
  process.exit(1);
});
