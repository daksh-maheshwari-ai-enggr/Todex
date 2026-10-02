#!/usr/bin/env node
import "dotenv/config";
import { HumanMessage } from "@langchain/core/messages";
import { createCodingAgent } from "./agent";
import { runCli, runAgentTurn } from "./cli";

async function main() {
  const prompt = process.argv.slice(2).join(" ").trim();

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
