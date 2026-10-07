import { useSyncExternalStore } from "react";
import { execFileSync } from "node:child_process";
import type {
  AgentStatus,
  AgentTurnEvents,
  LogEntry,
  LogKind,
  TuiBackend,
  ToolCallHandle,
  TodoItem,
} from "../types/types.js";
import { loadBackend } from "../utils/agent.js";
import { changedPath } from "../utils/toolDisplay.js";

/* ---------------------------------------------------------------------------
 * State shape
 * ------------------------------------------------------------------------ */

export interface TuiState {
  todos: TodoItem[];
  status: AgentStatus;
  activeTool: string | null;
  /** One-line summary of the active tool's arguments. */
  activeToolArg: string;
  historyCount: number;
  modelInfo: string;
  /** Directory the agent is operating on. */
  workspace: string;
  /** Current git branch, or null outside a repo. */
  gitBranch: string | null;
  /** Count of changed files reported by `git status`. */
  gitChanges: number;
  /** Files written/edited by tools this session. */
  filesChanged: string[];
  /** Append-only transcript of finished events. */
  log: LogEntry[];
  /** Assistant text currently streaming (not yet in the log). */
  streaming: string;
  busy: boolean;
  /** First-run gate: true when no provider API key has been configured yet. */
  setupRequired: boolean;
  /** Entries scrolled up from the live tail; 0 means "follow the output". */
  scrollOffset: number;
  /** Transcript window height in rows (published by AgentOutput). */
  viewportRows: number;
}

const INITIAL_STATE: TuiState = {
  todos: [],
  status: "idle",
  activeTool: null,
  activeToolArg: "",
  historyCount: 0,
  modelInfo: "loading…",
  workspace: process.cwd(),
  gitBranch: null,
  gitChanges: 0,
  filesChanged: [],
  log: [],
  streaming: "",
  busy: false,
  setupRequired: false,
  scrollOffset: 0,
  viewportRows: 20,
};

interface GitContext {
  branch: string | null;
  changes: number;
}

/** Read the branch + changed-file count for `dir` (silent outside a repo). */
function detectGit(dir: string): GitContext {
  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const porcelain = execFileSync("git", ["status", "--porcelain"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return {
      branch: branch || null,
      changes: porcelain.split("\n").filter((line) => line.trim()).length,
    };
  } catch {
    return { branch: null, changes: 0 };
  }
}

const TUI_HELP = `Commands:
  /help            Show this help
  /tools           List every registered tool
  /model           Show the configured model fallback chain
  /history         Show how many messages are in context
  /clear           Forget the conversation so far
  /exit, /quit     Leave the TUI

Keys:
  PgUp / PgDn       Scroll the transcript
  Shift+↑ / Shift+↓ Scroll one line
  Esc               Jump back to the latest output
  ↑ / ↓             Walk prompt history
  Enter             Send the prompt

Pasting multi-line text fills the input without sending — review it, then
press Enter to run it.`;

/** One-line summary of a tool call's arguments, for the log row. */
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

  try {
    const json = JSON.stringify(input);
    return json ? json.slice(0, 52) : "";
  } catch {
    return "";
  }
}

function safeModelInfo(backend: TuiBackend): string {
  try {
    return backend.describeModelChain() || "not configured";
  } catch {
    return "not configured";
  }
}

/** Has the backend already got a usable provider key? Never throws. */
function backendHasApiKey(backend: TuiBackend): boolean {
  try {
    return backend.hasApiKey() === true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------------
 * Store
 *
 * A tiny external store wired into React via useSyncExternalStore. All agent
 * output arrives through `turnEvents` (see types.ts) so the root agent turn
 * runner can drive this TUI exactly like the plain readline REPL.
 * ------------------------------------------------------------------------ */

class TuiStore {
  private state: TuiState = INITIAL_STATE;

  private listeners = new Set<() => void>();
  private backend: TuiBackend | null = null;
  private agent: unknown = null;
  private history: unknown[] = [];
  private exitFn: (() => void) | null = null;
  private toolEntryIds = new Map<string, number>();
  private pendingTools = 0;
  private nextId = 1;
  private changedFiles = new Set<string>();

  // Assistant tokens arrive in tiny chunks; coalesce them so each flush is
  // one render instead of one render per token.
  private streamBuf = "";
  private flushScheduled = false;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): TuiState => this.state;

  private patch(part: Partial<TuiState>): void {
    this.state = { ...this.state, ...part };
    for (const listener of this.listeners) listener();
  }

  /** Largest value `scrollOffset` can take for a given log length. */
  private maxScroll(logLength = this.state.log.length): number {
    return Math.max(0, logLength - this.state.viewportRows);
  }

  /**
   * Offset to store alongside a new log array.
   *
   * While the user is scrolled up, appended entries would otherwise shove the
   * viewport downward. Bumping the offset by the same amount keeps the visible
   * window anchored to the same entries while the live tail grows below it.
   */
  private offsetFor(next: LogEntry[]): number {
    const delta = next.length - this.state.log.length;
    if (delta <= 0 || this.state.scrollOffset <= 0) {
      return this.state.scrollOffset;
    }
    return Math.min(this.state.scrollOffset + delta, this.maxScroll(next.length));
  }

  private addLog(kind: LogKind, text: string, tool?: LogEntry["tool"]): void {
    const entry: LogEntry = {
      id: this.nextId++,
      kind,
      text,
      ...(tool ? { tool } : {}),
    };
    const log = [...this.state.log, entry];
    this.patch({ log, scrollOffset: this.offsetFor(log) });
  }

  /** Wire the launcher-provided backend (or none, to load it lazily). */
  configure(backend: TuiBackend | null): void {
    this.backend = backend;
    this.patch({
      workspace: process.cwd(),
      modelInfo: backend ? safeModelInfo(backend) : this.state.modelInfo,
      // With an injected backend we know the key state up front, so the setup
      // screen renders on the very first frame.
      setupRequired: backend ? !backendHasApiKey(backend) : false,
    });
    this.refreshContext();
  }

  /** Re-read the workspace git branch/status (startup and after each turn). */
  private refreshContext(): void {
    const git = detectGit(this.state.workspace);
    this.patch({ gitBranch: git.branch, gitChanges: git.changes });
  }

  setExit(fn: (() => void) | null): void {
    this.exitFn = fn;
  }

  /** Leave the TUI (used by the setup screen's cancel handler and /exit). */
  exit(): void {
    this.exitFn?.();
  }

  /** Transcript window height, published by AgentOutput on layout. */
  setViewportRows(rows: number): void {
    if (rows > 0 && rows !== this.state.viewportRows) {
      this.patch({ viewportRows: rows });
    }
  }

  /** Scroll the transcript by a number of entries (positive = older). */
  scrollBy(entries: number): void {
    const next = Math.max(
      0,
      Math.min(this.state.scrollOffset + entries, this.maxScroll())
    );
    if (next !== this.state.scrollOffset) {
      this.patch({ scrollOffset: next });
    }
  }

  /** Scroll by roughly one screen in the given direction. */
  scrollPage(direction: "up" | "down"): void {
    const step = Math.max(1, this.state.viewportRows - 1);
    this.scrollBy(direction === "up" ? step : -step);
  }

  /** Jump back to the live tail (also used when a new prompt is submitted). */
  scrollToBottom(): void {
    if (this.state.scrollOffset !== 0) {
      this.patch({ scrollOffset: 0 });
    }
  }

  /** Reset conversation/UI state (called on every TUI start). */
  reset(): void {
    this.state = {
      ...INITIAL_STATE,
      workspace: process.cwd(),
      modelInfo: this.backend ? this.state.modelInfo : "loading…",
      setupRequired: this.backend ? !backendHasApiKey(this.backend) : false,
    };
    this.agent = null;
    this.history = [];
    this.toolEntryIds.clear();
    this.pendingTools = 0;
    this.streamBuf = "";
    this.flushScheduled = false;
    this.changedFiles.clear();
    this.emit();
    this.refreshContext();
  }

  /** Load the backend lazily when the TUI was started standalone. */
  async bootstrap(): Promise<void> {
    this.refreshContext();
    if (this.backend) {
      this.patch({ setupRequired: !backendHasApiKey(this.backend) });
      this.addLog("system", "Agent backend ready.");
      return;
    }
    try {
      this.backend = await loadBackend();
      this.patch({
        modelInfo: safeModelInfo(this.backend),
        setupRequired: !backendHasApiKey(this.backend),
      });
      this.addLog("system", "Agent backend loaded from the root package.");
    } catch (err: any) {
      this.patch({ modelInfo: "unavailable", setupRequired: false });
      this.addLog("error", String(err?.message ?? err));
    }
  }

  /**
   * Persist the first-run provider API key and leave the setup gate.
   *
   * Saves through the injected backend (which wraps `src/config.ts`), then
   * re-reads the key state so a failed write keeps the setup screen up.
   */
  saveApiKey(apiKey: string): boolean {
    if (!this.backend) {
      this.addLog(
        "error",
        "Agent backend is not loaded yet — cannot save the API key."
      );
      return false;
    }

    try {
      this.backend.saveApiKey(apiKey.trim());
    } catch (err: any) {
      this.addLog(
        "error",
        `Could not save the API key: ${err?.message ?? err}`
      );
      return false;
    }

    if (!backendHasApiKey(this.backend)) {
      this.addLog(
        "error",
        "The API key did not persist — check ~/.config/todex permissions."
      );
      return false;
    }

    this.patch({
      setupRequired: false,
      modelInfo: safeModelInfo(this.backend),
    });
    this.addLog("system", "FreeLLMAPI API key saved. Agent ready.");
    return true;
  }

  /** Where agent-turn output goes (handed to the backend's runAgentTurn). */
  readonly turnEvents: AgentTurnEvents = {
    token: (text: string) => {
      if (!text) return;
      this.streamBuf += text;
      if (this.flushScheduled) return;
      this.flushScheduled = true;
      setTimeout(() => this.flushStream(), 16);
    },

    toolStart: (call: ToolCallHandle) => {
      this.flushStream();
      const streamed = this.state.streaming.trim();
      this.patch({ streaming: "" });
      // Assistant text that arrived before this tool call keeps its place
      // in the transcript ordering.
      if (streamed) this.addLog("assistant", streamed);

      const key = call.callId ?? call.name;
      const id = this.nextId++;
      this.toolEntryIds.set(key, id);
      this.pendingTools++;

      const entry: LogEntry = {
        id,
        kind: "tool",
        text: call.name,
        tool: { name: call.name, args: summarizeArgs(call.input), done: false },
      };
      const log = [...this.state.log, entry];
      this.patch({
        log,
        scrollOffset: this.offsetFor(log),
        activeTool: call.name,
        activeToolArg: summarizeArgs(call.input),
        status: "running",
      });
    },

    toolEnd: (
      call: ToolCallHandle,
      durationMs: number,
      failed: boolean,
      errorMessage?: string
    ) => {
      this.pendingTools = Math.max(0, this.pendingTools - 1);
      const key = call.callId ?? call.name;
      const id = this.toolEntryIds.get(key);
      this.toolEntryIds.delete(key);

      let log = this.state.log;
      if (id != null) {
        log = log.map((e) =>
          e.id === id && e.tool
            ? {
                ...e,
                tool: {
                  ...e.tool,
                  done: true,
                  durationMs,
                  failed,
                  errorMessage,
                },
              }
            : e
        );
      } else {
        // We never saw the start (attached mid-turn): log the result raw.
        const entry: LogEntry = {
          id: this.nextId++,
          kind: "tool",
          text: call.name,
          tool: {
            name: call.name,
            args: summarizeArgs(call.input),
            done: true,
            durationMs,
            failed,
            errorMessage,
          },
        };
        log = [...log, entry];
      }

      if (!failed) {
        const changed = changedPath(call.name, call.input);
        if (changed) this.changedFiles.add(changed);
      }

      this.patch({
        log,
        scrollOffset: this.offsetFor(log),
        filesChanged: [...this.changedFiles],
        activeTool: this.pendingTools > 0 ? this.state.activeTool : null,
        activeToolArg: this.pendingTools > 0 ? this.state.activeToolArg : "",
        status: this.state.busy
          ? this.pendingTools > 0
            ? "running"
            : "thinking"
          : "idle",
      });
    },

    todos: (todos: TodoItem[] | null) => {
      if (!todos || todos.length === 0) return;
      this.patch({
        todos: todos.map((t) => ({
          task: String(t?.task ?? "(untitled)"),
          status: String(t?.status ?? "pending"),
        })),
      });
    },
  };

  private flushStream(): void {
    if (this.streamBuf) {
      const chunk = this.streamBuf;
      this.streamBuf = "";
      this.patch({ streaming: this.state.streaming + chunk });
    }
    this.flushScheduled = false;
  }

  /** Submit a prompt or slash command (the CommandBar's Enter handler). */
  async submit(raw: string): Promise<void> {
    const input = raw.trim();
    if (!input) return;

    // Commands always work — even mid-turn (e.g. /exit, /help).
    if (input.startsWith("/")) {
      this.handleCommand(input);
      return;
    }

    if (this.state.busy) {
      this.addLog(
        "system",
        "Agent is busy — wait for the current turn to finish."
      );
      return;
    }

    if (!this.backend) {
      this.addLog(
        "error",
        "Agent backend is not loaded yet — cannot run the request."
      );
      return;
    }

    this.addLog("user", input);
    // A new prompt means the user wants to watch fresh output.
    this.patch({ busy: true, status: "thinking", streaming: "", scrollOffset: 0 });

    try {
      if (!this.agent) this.agent = this.backend.createCodingAgent();
      const HumanMessage = this.backend.HumanMessage;
      const next = [...this.history, new HumanMessage(input)];
      const result = await this.backend.runAgentTurn(
        this.agent,
        next,
        this.turnEvents
      );
      this.history = this.backend.trimHistory(result as unknown[]);

      this.flushStream();
      const streamed = this.state.streaming.trim();
      this.patch({
        historyCount: this.history.length,
        streaming: "",
        busy: false,
        status: "idle",
      });
      if (streamed) this.addLog("assistant", streamed);
      this.refreshContext();
    } catch (err: any) {
      this.flushStream();
      const streamed = this.state.streaming.trim();
      this.patch({ streaming: "", busy: false, status: "error" });
      if (streamed) this.addLog("assistant", streamed);
      this.addLog("error", String(err?.message ?? err));
    }
  }

  private handleCommand(input: string): void {
    const [cmd] = input.slice(1).split(/\s+/);

    switch (cmd) {
      case "exit":
      case "quit":
        this.exitFn?.();
        return;

      case "help":
        this.addLog("system", TUI_HELP);
        return;

      case "clear":
        this.history = [];
        this.patch({ historyCount: 0 });
        this.addLog("system", "Conversation context cleared.");
        return;

      case "tools":
        this.addLog(
          "system",
          this.backend ? this.backend.renderToolManifest() : "Backend unavailable."
        );
        return;

      case "model":
        this.addLog(
          "system",
          this.backend
            ? this.backend.describeModelChain()
            : "Backend unavailable."
        );
        return;

      case "history":
        this.addLog("system", `${this.history.length} message(s) in context.`);
        return;

      default:
        this.addLog("system", `Unknown command: /${cmd}. Type /help.`);
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const store = new TuiStore();

/** Subscribe a component to a slice of the TUI state. */
export function useTuiState<T>(selector: (state: TuiState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState())
  );
}
