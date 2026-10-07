/**
 * Shared types for the Ink TUI.
 *
 * These are intentionally re-declared here instead of imported from the root
 * `src/` package: the TUI is a standalone ESM package and must not create a
 * static dependency on the agent's CommonJS sources. The backend object the
 * launcher injects satisfies these interfaces structurally.
 */

export type TodoStatus = "pending" | "in_progress" | "completed" | "blocked";

export interface TodoItem {
  task: string;
  status: TodoStatus | string;
}

/** Structural view of the `run.toolCalls` projection (v3 streaming). */
export interface ToolCallHandle {
  name: string;
  callId?: string;
  input: unknown;
  status: Promise<"running" | "finished" | "error">;
  error: Promise<string | undefined>;
}

/**
 * Where an agent turn's output goes. Mirrors `AgentTurnEvents` in the root
 * `src/cli.ts`: the store implements this and hands it to the backend's
 * `runAgentTurn`, which routes tokens / tool status / TODO updates here
 * instead of writing to stdout.
 */
export interface AgentTurnEvents {
  /** Assistant text token streamed. */
  token(text: string): void;
  /** A tool call started. */
  toolStart(call: ToolCallHandle): void;
  /** A tool call finished. */
  toolEnd(
    call: ToolCallHandle,
    durationMs: number,
    failed: boolean,
    errorMessage?: string
  ): void;
  /** The agent's TODO list changed (null when it could not be read). */
  todos(todos: TodoItem[] | null): void;
}

/** Everything the TUI needs from the agent, injected by the launcher. */
export interface TuiBackend {
  createCodingAgent(): unknown;
  runAgentTurn(
    agent: unknown,
    messages: unknown[],
    events: AgentTurnEvents
  ): Promise<unknown[]>;
  trimHistory(messages: unknown[]): unknown[];
  renderToolManifest(): string;
  describeModelChain(): string;
  HumanMessage: new (content: string) => unknown;
  /** True when a usable provider API key is stored or present in the env. */
  hasApiKey(): boolean;
  /** Persist a provider API key to the global config (0600). */
  saveApiKey(apiKey: string): void;
}

export type AgentStatus = "idle" | "thinking" | "running" | "error";

export type LogKind = "user" | "assistant" | "tool" | "system" | "error";

export interface ToolInfo {
  name: string;
  args: string;
  done: boolean;
  durationMs?: number;
  failed?: boolean;
  errorMessage?: string;
}

export interface LogEntry {
  id: number;
  kind: LogKind;
  text: string;
  tool?: ToolInfo;
}
