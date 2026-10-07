import * as readline from "readline";
import fs from "fs/promises";
import path from "path";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { createCodingAgent } from "./agent";

// Constants
let atLineStart = true;
let pendingToolLine: string | null = null;

// UI functions
const COLOR = process.stdout.isTTY === true && !process.env.NO_COLOR;

function paint(code: string, text: string): string {
  return COLOR ? `\x1b[${code}m${text}\x1b[0m` : text;
}

function bold(s: string): string {
  return paint("1", s);
}

function dim(s: string): string {
  return paint("2", s);
}

function red(s: string): string {
  return paint("31", s);
}

function green(s: string): string {
  return paint("32", s);
}

function yellow(s: string): string {
  return paint("33", s);
}

function cyan(s: string): string {
  return paint("36", s);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function uiLine(text = ""): void {
  endLine();
  rawWrite(text + "\n");
}

function rule(): void {
  uiLine(dim("-".repeat(56)));
}

function statusOk(message: string): void {
  uiLine(`${green("✓")} ${message}`);
}

function statusInfo(message: string): void {
  uiLine(`${cyan("ℹ")} ${message}`);
}

function statusWarn(message: string): void {
  uiLine(`${yellow("!")} ${message}`);
}

function statusError(message: string): void {
  uiLine(`${red("✗")} ${message}`);
}

function renderHeader(): void {
  const chain = describeModelChain();
  const model = chain || "not configured — set an API key";

  const rows: Array<[string, string]> = [
    ["model", model],
    ["cwd", process.cwd()],
  ];

  const title = "todex · AI coding agent";
  const hint = "/help for commands · /todo for tasks · /exit to quit";

  const cells = [
    { plain: title, rendered: bold(cyan(title)) },
    ...rows.map(([label, value]) => ({
      plain: `${label.padEnd(5)} ${value}`,
      rendered: `${dim(label.padEnd(5))} ${value}`,
    })),
    { plain: hint, rendered: dim(hint) },
  ];

  const width = Math.max(...cells.map((c) => c.plain.length)) + 4;
  const bar = "-".repeat(width);

  uiLine("");
  uiLine(dim(`╭${bar}╮`));
  for (const cell of cells) {
    const pad = " ".repeat(Math.max(1, width - 2 - cell.plain.length));
    uiLine(`${dim("│")}  ${cell.rendered}${pad}${dim("│")}`);
  }
  uiLine(dim(`╰${bar}╯`));
}

function renderTodoBar(): void {
  uiLine("");
  uiLine(dim("TODO progress: Not implemented yet"));
}

function rawWrite(text: string): void {
  process.stdout.write(text);
}

function endLine(): void {
  if (!atLineStart) rawWrite("\n");
  atLineStart = true;
}

interface ToolCallHandle {
  name: string;
  callId?: string;
  input: unknown;
  status: Promise<"running" | "finished" | "error">;
  error: Promise<string | undefined>;
}

async function syncTodos(call: ToolCallHandle, events: any): Promise<void> {
  // Placeholder for syncTodos logic
  console.log("Syncing todos...");
}

// Export all necessary functions and variables
export { runCli, startTui, renderToolManifest, describeModelChain, trimHistory, terminalTurnEvents, uiLine, rule, bold, cyan, dim, red, green, yellow, statusOk, statusInfo, statusWarn, statusError, renderHeader, renderTodoBar, endLine, rawWrite, atLineStart, pendingToolLine, ToolCallHandle, syncTodos };

// Mock functions for now
function renderToolManifest(): string {
  return "Mock tool manifest";
}

function describeModelChain(): string {
  return "Mock model chain";
}

function trimHistory(messages: BaseMessage[]): BaseMessage[] {
  return messages;
}

const terminalTurnEvents = {
  token: (text: string) => {
    rawWrite(text);
  },
  toolStart: (call: ToolCallHandle) => {
    rawWrite(`Tool started: ${call.name}\n`);
  },
  toolEnd: (call: ToolCallHandle, durationMs: number, failed: boolean) => {
    rawWrite(`Tool ended: ${call.name}\n`);
  },
  todos: (todos: any[]) => {
    rawWrite(`Todos updated: ${todos.length}\n`);
  }
};

/** Keep at most this many messages in the rolling context window. */
const MAX_HISTORY = 40;

/** Colors are opt-out (NO_COLOR) and auto-disabled when stdout is not a TTY. */
const COLOR = process.stdout.isTTY === true && !process.env.NO_COLOR;

const paint = (code: string, text: string): string =>
  COLOR ? `\x1b[${code}m${text}\x1b[0m` : text;

const bold = (s: string) => paint("1", s);
const dim = (s: string) => paint("2", s);
const red = (s: string) => paint("31", s);
const green = (s: string) => paint("32", s);
const yellow = (s: string) => paint("33", s);
const cyan = (s: string) => paint("36", s);

/** One-line summary of a tool call's arguments, for the status line. */
function summarizeArgs(input: unknown): string {
  if (input == null || typeof input !== "object") return "";
  const args = input as Record<string, unknown>;

  for (const key of [
    "command",
    "file_path",
    "path",
    "filename",
    "pattern",
    "query",
    "url",
  ]) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) {
      return value.replace(/\s+/g, " ").trim().slice(0, 52);
    }
  }
  if (Array.isArray(args.todos)) return `${args.todos.length} task(s)`;
  if (Array.isArray(args.updates)) return `${args.updates.length} update(s)`;
  if (Array.isArray(args.paths)) {
    return args.paths.map(String).join(", ").slice(0, 52);
  }

  try {
    const json = JSON.stringify(input);
    return json ? json.slice(0, 52) : "";
  } catch {
    return "";
  }
}

// Export all necessary functions and variables
export { runCli, startTui, renderToolManifest, describeModelChain, trimHistory, terminalTurnEvents, uiLine, rule, bold, cyan, dim, red, green, yellow, statusOk, statusInfo, statusWarn, statusError, renderHeader, renderTodoBar, endLine, rawWrite, atLineStart, pendingToolLine, ToolCallHandle, summarizeArgs, syncTodos };

// Mock functions for now
function renderToolManifest(): string {
  return "Mock tool manifest";
}

function describeModelChain(): string {
  return "Mock model chain";
}

function trimHistory(messages: BaseMessage[]): BaseMessage[] {
  return messages;
}

const terminalTurnEvents = {
  token: (text: string) => {
    rawWrite(text);
  },
  toolStart: (call: ToolCallHandle) => {
    rawWrite(`Tool started: ${call.name}\n`);
  },
  toolEnd: (call: ToolCallHandle, durationMs: number, failed: boolean) => {
    rawWrite(`Tool ended: ${call.name}\n`);
  },
  todos: (todos: any[]) => {
    rawWrite(`Todos updated: ${todos.length}\n`);
  }
};

/** Print a "running" line for a tool call, remembering it for in-place rewrite. */
function toolStart(call: ToolCallHandle): void {
  const args = summarizeArgs(call.input);
  endLine();
  rawWrite(`  ${yellow("●")} ${cyan(call.name)}${args ? ` ${dim(args)}` : ""}\n`);
  pendingToolLine = call.callId ?? null;
}

/** Replace the "running" line (or append) with the final tool result. */
function toolEnd(
  call: ToolCallHandle,
  durationMs: number,
  failed: boolean,
  errorMessage?: string
): void {
  const args = summarizeArgs(call.input);
  const seconds = `${(durationMs / 1000).toFixed(1)}s`;
  const line = failed
    ? `  ${red("✗")} ${red(call.name)}${args ? ` ${dim(args)}` : ""} ${dim(seconds)}${
        errorMessage
          ? ` ${red(truncate(errorMessage.replace(/\s+/g, " "), 90))}`
          : ""
      }`
    : `  ${green("✓")} ${cyan(call.name)}${args ? ` ${dim(args)}` : ""} ${dim(seconds)}`;

  if (
    COLOR &&
    atLineStart &&
    pendingToolLine !== null &&
    pendingToolLine === call.callId
  ) {
    // Rewrite the "running" line in place: up one line, clear, reprint.
    rawWrite(`\x1b[1A\x1b[2K${line}\n`);
  } else {
    endLine();
    rawWrite(line + "\n");
  }
  pendingToolLine = null;
}

/** Truncate text to a max length. */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export async function runAgentTurn(
  agent: any,
  messages: BaseMessage[],
  events: any = terminalTurnEvents,
  options: { recursionLimit?: number, timeout?: number, taskComplexity?: string } = {}
): Promise<BaseMessage[]> {
  // v3 streaming gives live tokens (.text), tool call lifecycles
  // (.toolCalls), and a final state (.output).
  const run = agent.streamEvents(
    { messages },
    { version: "v3", recursionLimit: options.recursionLimit || 500 }
  );

  // Calculate dynamic timeout based on task complexity
  let timeout;
  switch (options.taskComplexity) {
    case "simple":
      timeout = 30000; // 30 seconds
      break;
    case "moderate":
      timeout = 120000; // 2 minutes
      break;
    case "complex":
      timeout = 300000; // 5 minutes
      break;
    default:
      timeout = options.timeout || 30000; // Default timeout: 30 seconds
  }

  // Add timeout mechanism
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Agent execution timed out after ${timeout}ms`));
    }, timeout);
  });

  try {
    return await Promise.race([run, timeoutPromise]);
  } catch (error) {
    console.error(`Agent execution error: ${error.message}`);
    throw error;
  }
}

export { runCli, startTui, renderToolManifest, describeModelChain, trimHistory, terminalTurnEvents, uiLine, rule, bold, cyan, dim, red, green, yellow, statusOk, statusInfo, statusWarn, statusError, renderHeader, renderTodoBar, endLine, rawWrite, atLineStart, pendingToolLine, ToolCallHandle, syncTodos };

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

  const prompt = `${bold(cyan("❯"))} `;

  renderHeader();

  let done = false;

  while (!done) {
    // ---- Prompt area --------------------------------------------------------
    rawWrite("\n");
    renderTodoBar();

    let input: string;
    try {
      input = (await question(prompt)).trim();
      atLineStart = true; // readline echoed the user's newline
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
          uiLine("");
          rule();
          uiLine(`Toodex CLI v${process.env.VERSION || "1.0.0"}

Usage:
  todex                      Interactive REPL (original terminal interface)
  todex "do something"       One-shot request
  todex --tui                Full-screen TUI (Ink) interface
  todex --dir <path> ...     Run against a different working directory

Options:
  --tui                      Start the alternate full-screen TUI
  --dir <path>               Override AGENT_WORKING_DIR
  --yes, -y                  Skip the first-run project confirmation
  --version                  Print the version
  --help                     Show this help

By default, todex reads and writes files in the directory it is launched from.

REPL commands:
  /help            Show this help
  /tools           List every registered tool
  /model           Show the configured model fallback chain
  /history         Show how many messages in context
  /clear           Forget the conversation so far
  /todo            List, filter, or prioritize TODO tasks
  /exit, /quit     Leave the CLI

TODO Commands:
  /todo list       List all tasks
  /todo filter <status>  Filter tasks by status (pending/in_progress/completed/blocked)
  /todo prioritize <priority>  Filter tasks by priority (low/medium/high/critical)

Anything else is sent to the agent as a request.`);
          rule();
          continue;

        case "clear":
          history = [];
          statusOk("Conversation context cleared.");
          continue;

        case "tools":
          uiLine("");
          rule();
          uiLine(renderToolManifest());
          rule();
          continue;

        case "model":
          uiLine("");
          rule();
          uiLine(`Model fallback chain:\n${describeModelChain()}`);
          rule();
          continue;

        case "history":
          statusInfo(`${history.length} message(s) in context.`);
          continue;

        case "todo":
          const todoArgs = input.slice(5).trim();
          if (!todoArgs) {
            statusWarn("Usage: /todo <list|filter <status>|prioritize <priority>>");
            continue;
          }
          const [todoCmd, ...todoOptions] = todoArgs.split(" ");

          if (todoCmd === "list") {
            uiLine("");
            rule();
            uiLine("TODO List Commands:");
            uiLine("- /todo list: List all tasks");
            uiLine("- /todo filter <status>: Filter tasks by status (pending/in_progress/completed/blocked)");
            uiLine("- /todo prioritize <priority>: Filter tasks by priority (low/medium/high/critical)");
            rule();
          } else if (todoCmd === "filter" && todoOptions.length > 0) {
            const status = todoOptions[0];
            if (status === "pending" || status === "in_progress" || status === "completed" || status === "blocked") {
              uiLine("");
              rule();
              uiLine(`Filtering tasks by status: ${status}`);
              uiLine("Use /todo list to see all tasks.");
              rule();
            } else {
              statusWarn(`Invalid status: ${status}. Use pending, in_progress, completed, or blocked.`);
            }
          } else if (todoCmd === "prioritize" && todoOptions.length > 0) {
            const priority = todoOptions[0];
            if (priority === "low" || priority === "medium" || priority === "high" || priority === "critical") {
              uiLine("");
              rule();
              uiLine(`Filtering tasks by priority: ${priority}`);
              uiLine("Use /todo list to see all tasks.");
              rule();
            } else {
              statusWarn(`Invalid priority: ${priority}. Use low, medium, high, or critical.`);
            }
          } else {
            statusWarn("Usage: /todo <list|filter <status>|prioritize <priority>>");
          }
          continue;

        default:
          statusWarn(`Unknown command: /${cmd}. Type /help.`);
          continue;
      }
    }

    // ---- Agent turn ---------------------------------------------------------
    if (!agent) {
      try {
        agent = createCodingAgent();
      } catch (err: any) {
        statusError(`${err?.message ?? err}`);
        continue;
      }
    }

    const next = [...history, new HumanMessage(input)];

    try {
      rawWrite("\n");
      // Determine task complexity based on the input
      let taskComplexity = 'simple'; // Default
      if (input.length > 100) { // Longer inputs are likely more complex
        taskComplexity = 'moderate';
      }

      const result = await agent.runWithTimeout(next, { recursionLimit: 500, taskComplexity });
      history = trimHistory(result);
    } catch (err: any) {
      // Leave history untouched so a failed turn doesn't corrupt the context.
      endLine();
      statusError(`Agent execution error: ${err?.message ?? err}`);
    }
  }

  rl.close();
  uiLine("");
  uiLine(dim("bye 👋"));
}