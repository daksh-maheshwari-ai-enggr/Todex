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

Anything else is sent to the agent as a request.`;

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

  private addLog(kind: LogKind, text: string, tool?: LogEntry["tool"]): void {
    const entry: LogEntry = {
      id: this.nextId++,
      kind,
      text,
      ...(tool ? { tool } : {}),
    };
    this.patch({ log: [...this.state.log, entry] });
  }

  /** Wire the launcher-provided backend (or none, to load it lazily). */
  configure(backend: TuiBackend | null): void {
    this.backend = backend;
    this.patch({
      workspace: process.cwd(),
      modelInfo: backend ? safeModelInfo(backend) : this.state.modelInfo,
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

  /** Reset conversation/UI state (called on every TUI start). */
  reset(): void {
    this.state = {
      ...INITIAL_STATE,
      workspace: process.cwd(),
      modelInfo: this.backend ? this.state.modelInfo : "loading…",
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
      this.addLog("system", "Agent backend ready.");
      return;
    }
    try {
      this.backend = await loadBackend();
      this.patch({ modelInfo: safeModelInfo(this.backend) });
      this.addLog("system", "Agent backend loaded from the root package.");
    } catch (err: any) {
      this.patch({ modelInfo: "unavailable" });
      this.addLog("error", String(err?.message ?? err));
    }
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
      this.patch({
        log: [...this.state.log, entry],
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
    this.patch({ busy: true, status: "thinking", streaming: "" });

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
