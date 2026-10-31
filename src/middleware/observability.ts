import { createMiddleware } from "langchain";
import type { ToolCallRequest } from "langchain";

/**
 * Observability middleware.
 *
 * Prints every tool call, every subagent spawn, and every TODO mutation
 * so you can see which tools are being called, how many subagents are
 * spawned, and which agent is doing what.
 *
 * Attach it to any agent via `createAgent({ ..., middleware: [observabilityMiddleware()] })`.
 */

export type ObservabilityOptions = {
  /** Label printed in the log lines, e.g. "orchestrator". */
  agentLabel?: string;
  /** Print tool-call arguments. Defaults to false (keeps output short). */
  verboseArgs?: boolean;
};

/** Module-level counters so the summary is accurate across turns. */
const counters = {
  toolCalls: 0,
  subagentSpawns: 0,
  todoWrites: 0,
  todoUpdates: 0,
};

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function preview(value: unknown, max = 120): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/**
 * Build the observability middleware.
 *
 * Hooks:
 *   - `wrapToolCall`  — logs every tool invocation, its args, and duration.
 *   - `beforeModel`   — logs a lightweight turn marker.
 *
 * Subagent spawns and TODO mutations are detected by matching tool names
 * inside `wrapToolCall`, so no extra hooks are needed.
 */
export function observabilityMiddleware(
  options: ObservabilityOptions = {}
) {
  const label = options.agentLabel ?? "agent";
  const verboseArgs = options.verboseArgs ?? false;

  const log = (msg: string) => {
    // eslint-disable-next-line no-console
    console.log(`[obs][${label}] ${stamp()} ${msg}`);
  };

  return createMiddleware({
    name: `observability-${label}`,

    wrapToolCall(request: ToolCallRequest, handler: any) {
      const toolName = request.toolCall.name ?? "(unknown)";
      const args = request.toolCall.args;

      counters.toolCalls++;

      // Detect subagent spawns and TODO mutations by tool name.
      if (toolName === "task" || toolName === "handoff") {
        counters.subagentSpawns++;
        log(`🚀 SPAWN subagent via ${toolName}: ${preview(args?.task ?? args, 80)}`);
      } else if (toolName === "write_todos") {
        counters.todoWrites++;
        const count = Array.isArray(args?.todos) ? args.todos.length : 0;
        log(`📋 TODO write (${count} task${count === 1 ? "" : "s"}) by ${label}`);
      } else if (toolName === "update_todos") {
        counters.todoUpdates++;
        const count = Array.isArray(args?.updates) ? args.updates.length : 0;
        const statuses = Array.isArray(args?.updates)
          ? [...new Set(args.updates.map((u: any) => u.status).filter(Boolean))]
          : [];
        log(`📋 TODO update (${count} task${count === 1 ? "" : "s"}: ${statuses.join(", ") || "n/a"}) by ${label}`);
      } else {
        log(`🔧 CALL ${toolName}${verboseArgs ? ` args=${preview(args)}` : ""}`);
      }

      const started = Date.now();

      return handler(request).then(
        (result: any) => {
          const ms = Date.now() - started;
          const text =
            typeof result === "string"
              ? result
              : Array.isArray(result?.content)
                ? result.content.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("")
                : String(result ?? "");
          log(`   ↳ ${toolName} done in ${ms}ms${text ? ` → ${preview(text, 80)}` : ""}`);
          return result;
        },
        (err: any) => {
          const ms = Date.now() - started;
          log(`   ↳ ${toolName} FAILED in ${ms}ms: ${err?.message ?? String(err)}`);
          throw err;
        }
      );
    },

    beforeModel(state: any, _runtime: any) {
      const messages = (state as any).messages ?? [];
      const last = messages[messages.length - 1];
      const role = (last as any)?._role ?? (last as any)?.$type ?? "msg";
      log(`🧠 MODEL turn starts (${messages.length} msgs, last=${role})`);
    },
  });
}

/** Print a summary of everything observed so far. */
export function printObservabilitySummary(label = "agent"): void {
  const total =
    counters.toolCalls + counters.subagentSpawns + counters.todoWrites + counters.todoUpdates;
  // eslint-disable-next-line no-console
  console.log(
    `[obs][${label}] ${stamp()} SUMMARY — ` +
      `tool calls: ${counters.toolCalls}, ` +
      `subagents spawned: ${counters.subagentSpawns}, ` +
      `TODO writes: ${counters.todoWrites}, ` +
      `TODO updates: ${counters.todoUpdates}, ` +
      `total events: ${total}`
  );
}

/** Reset all counters (useful between sessions). */
export function resetObservabilityCounters(): void {
  counters.toolCalls = 0;
  counters.subagentSpawns = 0;
  counters.todoWrites = 0;
  counters.todoUpdates = 0;
}

/** Read-only snapshot of the counters. */
export function getCounters() {
  return { ...counters };
}