import * as readline from "readline";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { createCodingAgent } from "./agent";
import { renderToolManifest } from "./tools";
import { describeModelChain } from "./model";

/** Keep at most this many messages in the rolling context window. */
const MAX_HISTORY = 40;

const HELP_TEXT = `
Commands:
  /help            Show this help
  /tools           List every registered tool
  /model           Show the configured model fallback chain
  /history         Show how many messages are in context
  /clear           Forget the conversation so far
  /exit, /quit     Leave the CLI

Anything else is sent to the agent as a request.
`.trim();

/**
 * Trim the context window without breaking tool-call / tool-result pairs:
 * we only ever cut at a HumanMessage boundary, so an AI message that issued
 * tool calls is never separated from the ToolMessages that answer them.
 */
function trimHistory(
  messages: BaseMessage[],
  max = MAX_HISTORY
): BaseMessage[] {
  if (messages.length <= max) return messages;

  let start = messages.length - max;
  while (start < messages.length && messages[start]?.getType?.() !== "human") {
    start++;
  }

  return start < messages.length ? messages.slice(start) : messages;
}

/**
 * Run one agent turn: stream assistant text to stdout, then return the full
 * resulting message history (input messages + everything the agent produced).
 *
 * Shared by the interactive CLI and the one-shot entry point.
 */
export async function runAgentTurn(
  agent: any,
  messages: BaseMessage[]
): Promise<BaseMessage[]> {
  // v3 streaming gives live tokens (.text) and a final state (.output).
  const run = await agent.streamEvents({ messages }, { version: "v3" });

  for await (const message of run.messages as AsyncIterable<any>) {
    for await (const token of message.text as AsyncIterable<string>) {
      process.stdout.write(token);
    }
  }

  const state = await run.output;
  return (state?.messages ?? messages) as BaseMessage[];
}

/** Interactive REPL. */
export async function runCli(): Promise<void> {
  // Created lazily so commands like /help and /tools work before a model key
  // is available.
  let agent: any = null;

  let history: BaseMessage[] = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY ?? false,
  });

  const question = (query: string) =>
    new Promise<string>((resolve) => rl.question(query, resolve));

  console.log("╭─ Todex ─ AI coding agent");
  console.log("│  /help for commands · /exit to quit");
  console.log("╰────────────────────────────────────────");

  let done = false;

  while (!done) {
    let input: string;
    try {
      input = (await question("\n› ")).trim();
    } catch {
      break; // stdin closed
    }

    if (!input) continue;

    // ---- Slash commands -----------------------------------------------------
    if (input.startsWith("/")) {
      const [cmd] = input.slice(1).split(/\s+/);

      switch (cmd) {
        case "exit":
        case "quit":
          done = true;
          continue;

        case "help":
          console.log("\n" + HELP_TEXT);
          continue;

        case "clear":
          history = [];
          console.log("🧹 Conversation context cleared.");
          continue;

        case "tools":
          console.log("\n" + renderToolManifest());
          continue;

        case "model":
          console.log("\nModel fallback chain:\n" + describeModelChain());
          continue;

        case "history":
          console.log(`📜 ${history.length} message(s) in context.`);
          continue;

        default:
          console.log(`Unknown command: /${cmd}. Type /help.`);
          continue;
      }
    }

    // ---- Agent turn ---------------------------------------------------------
    if (!agent) {
      try {
        agent = createCodingAgent();
      } catch (err: any) {
        console.log(`\n❌ ${err?.message ?? err}\n`);
        continue;
      }
    }

    const next = [...history, new HumanMessage(input)];

    try {
      console.log("");
      const result = await runAgentTurn(agent, next);
      history = trimHistory(result);
      console.log("");
    } catch (err: any) {
      // Leave history untouched so a failed turn doesn't corrupt the context.
      console.log(`\n❌ ${err?.message ?? err}\n`);
    }
  }

  rl.close();
  console.log("👋 Bye.");
}
