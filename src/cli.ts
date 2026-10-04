import * as readline from "readline";
import fs from "fs/promises";
import path from "path";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { createCodingAgent } from "./agent";
import { renderToolManifest } from "./tools";
import { describeModelChain, resolveProviderChain } from "./model";
import { WORKING_DIR } from "./workspace";

/** Keep at most this many messages in the rolling context window. */
const MAX_HISTORY = 40;

/* ============================================================================
 * Terminal UI primitives — ANSI styling, zero dependencies.
 * ========================================================================== */

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

/* ---------------------------------------------------------------------------
 * Line-aware writer.
 *
 * The agent emits interleaved output (assistant tokens, tool status lines,
 * TODO panels). To keep those streams from corrupting each other we track
 * whether the cursor sits at the start of a line, and which tool (if any)
 * owns the most recently printed line so its "running" line can be rewritten
 * in place when the call finishes.
 * ------------------------------------------------------------------------ */

let atLineStart = true;
let pendingToolLine: string | null = null;

function rawWrite(text: string): void {
  process.stdout.write(text);
}

/** Finish the current line if we are in the middle of one. */
function endLine(): void {
  if (!atLineStart) rawWrite("\n");
  atLineStart = true;
}

/** Stream assistant tokens, breaking out of any pending tool line first. */
function writeTokens(text: string): void {
  if (!text) return;
  pendingToolLine = null; // tool line stays; its finish will be appended
  rawWrite(text);
  atLineStart = text.endsWith("\n");
}

/** Print one complete line of UI output (status messages, panels, ...). */
function uiLine(text = ""): void {
  pendingToolLine = null;
  endLine();
  rawWrite(text + "\n");
}

/* ---------------------------------------------------------------------------
 * Colored status messages
 * ------------------------------------------------------------------------ */

const statusOk = (message: string) => uiLine(`${green("✓")} ${message}`);
const statusInfo = (message: string) => uiLine(`${cyan("ℹ")} ${message}`);
const statusWarn = (message: string) => uiLine(`${yellow("!")} ${message}`);
const statusError = (message: string) => uiLine(`${red("✗")} ${message}`);

const rule = () => uiLine(dim("─".repeat(56)));

/* ---------------------------------------------------------------------------
 * Tool execution status
 * ------------------------------------------------------------------------ */

/** Structural view of the `run.toolCalls` projection (v3 streaming). */
interface ToolCallHandle {
  name: string;
  callId?: string;
  input: unknown;
  status: Promise<"running" | "finished" | "error">;
  error: Promise<string | undefined>;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

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
      return truncate(value.replace(/\s+/g, " ").trim(), 52);
    }
  }
  if (Array.isArray(args.todos)) return `${args.todos.length} task(s)`;
  if (Array.isArray(args.updates)) return `${args.updates.length} update(s)`;
  if (Array.isArray(args.paths)) {
    return truncate(args.paths.map(String).join(", "), 52);
  }

  try {
    const json = JSON.stringify(input);
    return json ? truncate(json, 52) : "";
  } catch {
    return "";
  }
}

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

/* ---------------------------------------------------------------------------
 * TODO progress display
 * ------------------------------------------------------------------------ */

interface TodoItem {
  task: string;
  status: string;
}

const TODO_DIR = path.join(WORKING_DIR, ".agent-todos");

const TODO_GLYPHS: Record<string, string> = {
  completed: "✓",
  in_progress: "◉",
  pending: "○",
  blocked: "✗",
};

function todoPaint(status: string): (s: string) => string {
  switch (status) {
    case "completed":
      return green;
    case "in_progress":
      return cyan;
    case "blocked":
      return red;
    default:
      return dim;
  }
}

let activeTodos: TodoItem[] | null = null;

/** Candidate on-disk paths for a TODO list, clamped inside the todo dir. */
function todoFilePaths(filename: string): string[] {
  const candidates = filename.endsWith(".todos.json")
    ? [filename]
    : [`${filename}.todos.json`, filename];

  const paths: string[] = [];
  for (const candidate of candidates) {
    const resolved = path.resolve(TODO_DIR, candidate);
    if (resolved.startsWith(TODO_DIR + path.sep)) paths.push(resolved);
  }
  return paths;
}

/** Re-read the TODO list touched by a tool call and repaint the panel. */
async function syncTodos(call: ToolCallHandle): Promise<void> {
  const args = (call.input ?? {}) as Record<string, unknown>;
  const filename = typeof args.filename === "string" ? args.filename : null;

  if (filename) {
    for (const filePath of todoFilePaths(filename)) {
      try {
        const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
        if (Array.isArray(parsed) && parsed.length > 0) {
          activeTodos = parsed.map((t: any) => ({
            task: String(t?.task ?? "(untitled)"),
            status: String(t?.status ?? "pending"),
          }));
          renderTodoPanel(activeTodos);
          return;
        }
      } catch {
        // Try the next candidate path.
      }
    }
  }

  // Fallback: render straight from write_todos input if the file is missing.
  if (call.name === "write_todos" && Array.isArray(args.todos)) {
    activeTodos = (args.todos as any[]).map((t) => ({
      task: String(t?.task ?? "(untitled)"),
      status: String(t?.status ?? "pending"),
    }));
    renderTodoPanel(activeTodos);
  }
}

/** Full TODO panel, printed whenever the agent writes or updates its plan. */
function renderTodoPanel(todos: TodoItem[]): void {
  const width = 54;
  const done = todos.filter((t) => t.status === "completed").length;

  uiLine("");
  uiLine(dim(`  ── todos ${"─".repeat(width - 11)}`));
  for (const todo of todos) {
    const glyph = TODO_GLYPHS[todo.status] ?? "○";
    const paintTodo = todoPaint(todo.status);
    const label = paintTodo(truncate(todo.task, width - 14).padEnd(width - 14));
    uiLine(`  ${paintTodo(glyph)} ${label} ${dim(todo.status.padEnd(11))}`);
  }
  uiLine(dim(`  ── ${done}/${todos.length} completed`));
  uiLine("");
}

/** Compact progress bar shown above the input prompt. */
function renderTodoBar(): void {
  if (!activeTodos?.length) return;

  const total = activeTodos.length;
  const done = activeTodos.filter((t) => t.status === "completed").length;
  const current =
    activeTodos.find((t) => t.status === "in_progress") ??
    activeTodos.find((t) => t.status === "pending");

  const width = 22;
  const filled = Math.round((done / total) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);

  uiLine(
    `  ${cyan(bar)} ${dim(`${done}/${total} done`)}${
      current ? dim(` · next: ${truncate(current.task, 42)}`) : ""
    }`
  );
}

/* ---------------------------------------------------------------------------
 * Header
 * ------------------------------------------------------------------------ */

function renderHeader(): void {
  const chain = resolveProviderChain();
  const model =
    chain.length === 0
      ? "not configured — set an API key"
      : chain.length === 1
        ? chain[0].model
        : `${chain[0].model} (+${chain.length - 1} fallback)`;

  const rows: Array<[string, string]> = [
    ["model", model],
    ["cwd", WORKING_DIR],
  ];

  const title = "todex · AI coding agent";
  const hint = "/help for commands · /exit to quit";

  const cells = [
    { plain: title, rendered: bold(cyan(title)) },
    ...rows.map(([label, value]) => ({
      plain: `${label.padEnd(5)} ${value}`,
      rendered: `${dim(label.padEnd(5))} ${value}`,
    })),
    { plain: hint, rendered: dim(hint) },
  ];

  const width = Math.max(...cells.map((c) => c.plain.length)) + 4;
  const bar = "─".repeat(width);

  uiLine("");
  uiLine(dim(`╭${bar}╮`));
  for (const cell of cells) {
    const pad = " ".repeat(Math.max(1, width - 2 - cell.plain.length));
    uiLine(`${dim("│")}  ${cell.rendered}${pad}${dim("│")}`);
  }
  uiLine(dim(`╰${bar}╯`));
}

/* ---------------------------------------------------------------------------
 * Help
 * ------------------------------------------------------------------------ */

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
 * Run one agent turn: stream assistant text to stdout, render live tool
 * execution status, and return the full resulting message history (input
 * messages + everything the agent produced).
 *
 * Shared by the interactive CLI and the one-shot entry point.
 */
export async function runAgentTurn(
  agent: any,
  messages: BaseMessage[]
): Promise<BaseMessage[]> {
  // v3 streaming gives live tokens (.text), tool call lifecycles
  // (.toolCalls), and a final state (.output).
  const run = await agent.streamEvents(
    { messages },
    { version: "v3", recursionLimit: 100 }
  );

  const toolCalls = run.toolCalls as
    | AsyncIterable<ToolCallHandle>
    | undefined;

  /** Stream assistant tokens to stdout. */
  const consumeMessages = async (): Promise<void> => {
    for await (const message of run.messages as AsyncIterable<any>) {
      for await (const token of message.text as AsyncIterable<string>) {
        writeTokens(token);
      }
    }
  };

  /** Render live tool execution status and keep the TODO panel in sync. */
  const consumeToolCalls = async (): Promise<void> => {
    if (!toolCalls) return;

    for await (const call of toolCalls) {
      const startedAt = Date.now();
      toolStart(call);

      let failed = false;
      let errorMessage: string | undefined;
      try {
        failed = (await call.status) === "error";
        errorMessage = await call.error;
      } catch (err: any) {
        failed = true;
        errorMessage = err?.message ?? String(err);
      }

      toolEnd(call, Date.now() - startedAt, failed, errorMessage);

      if (
        !failed &&
        (call.name === "write_todos" || call.name === "update_todos")
      ) {
        await syncTodos(call);
      }
    }
  };

  await Promise.all([consumeMessages(), consumeToolCalls()]);

  const state = await run.output;

  // Leave the terminal at the start of a fresh line after the turn.
  endLine();

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
          uiLine(HELP_TEXT);
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
      const result = await runAgentTurn(agent, next);
      history = trimHistory(result);
    } catch (err: any) {
      // Leave history untouched so a failed turn doesn't corrupt the context.
      endLine();
      statusError(`${err?.message ?? err}`);
    }
  }

  rl.close();
  uiLine("");
  uiLine(dim("bye 👋"));
}
