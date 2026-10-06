import type { StructuredToolInterface } from "@langchain/core/tools";

// ---- Individual tools -------------------------------------------------------

import { bashTool } from "./bash";
import { astAnalyzeTool } from "./ast";
import { think_tool } from "./thinkTool";
import { filesystemTools } from "./fileSystem";
import { createReactProjectTool } from "./createReactProject";
import { gitTools } from "./git";
import { graphTools } from "./importGraph";
import { ragTools } from "./rag";
import { agentMemoryTools } from "./ProjectContextBuilder";
import {
  write_todos,
  read_todos,
  update_todos,
  get_next_runnable_tasks,
} from "./todo";
import { createTaskTool } from "./task/task";
import { filterTasksTool } from "./todoFilter";

/**
 * The tool registry.
 *
 * Every tool in the project lives in exactly one group. This is the single
 * source of truth — `src/index.ts` and the CLI should never import individual
 * tool files directly, only this module.
 *
 * To add a tool: export it from its own file, then drop it into the relevant
 * group below (or add a new group).
 */
export const toolGroups: Record<string, StructuredToolInterface[]> = {
  /** Read/write/edit files, list dirs, grep, file tree, project scaffolding. */
  filesystem: [...filesystemTools, createReactProjectTool],

  /** Execute shell commands inside the sandboxed working dir. */
  shell: [bashTool],

  /** Git diff / log / status. */
  git: gitTools,

  /** Build + query the import dependency graph and blast-radius analysis. */
  graph: graphTools,

  /** AST structure analysis of a single JS/TS file. */
  ast: [astAnalyzeTool],  //Updated to latest. Got 6 features, 49 bugfixes, and 33 other changes.
  //code.claude.com/docs/en/changelog for details



  /** Semantic search + embedding over the codebase. */
  rag: ragTools,

  /** Persistent .agent/ project + module memory. */
  memory: agentMemoryTools,

  /** Workflow TODO planning and dependency scheduling. */
  todo: [
    write_todos,
    read_todos,
    update_todos,
    get_next_runnable_tasks,
  ],

  /**
   * Lightweight reasoning / scratchpad.
   * `think_tool` is free and instant — it makes no external calls.
   */
  reasoning: [think_tool],
};

/** Every group name, in a stable, human-readable order. */
export const TOOL_GROUP_NAMES = Object.keys(toolGroups) as ToolGroupName[];

export type ToolGroupName = keyof typeof toolGroups;

/** A flat list of every non-task tool in the registry. */
export const tools: StructuredToolInterface[] = TOOL_GROUP_NAMES.flatMap((group) => toolGroups[group]).concat(filterTasksTool);

// ---- Factory ----------------------------------------------------------------

export interface BuildToolsOptions {
  /**
   * Chat model to hand to the `task` (subagent) tool.
   * If omitted, the `task` tool is not included.
   */
  model?: unknown;

  /** Extra config forwarded to `createTaskTool` (e.g. `{ tools }`). */
  taskConfig?: Record<string, unknown>;

  /**
   * Only include these groups. Defaults to all groups.
   * Example: `["filesystem", "git", "shell"]` for a minimal coding agent.
   */
  groups?: ToolGroupName[];

  /** Include the `task` subagent tool. Requires `model`. */
  includeTask?: boolean;

  /** Tool names to remove after selection (e.g. `["bash"]` for a read-only agent). */
  exclude?: string[];

  /** Tool names to keep, even if their group was not selected. */
  include?: string[];
}

/**
 * Build the tool set for a single agent run.
 *
 * This is the function the CLI/agent should call. It lets you toggle whole
 * capability groups on and off per task without editing any tool file:
 *
 *   // Full coding agent
 *   buildTools({ model, includeTask: true });
 *
 *   // Read-only "explain this repo" agent
 *   buildTools({ groups: ["filesystem", "ast", "graph", "memory"] });
 *
 *   // Everything except destructive shell access
 *   buildTools({ model, includeTask: true, exclude: ["bash"] });
 */
export function buildTools(options: BuildToolsOptions = {}): StructuredToolInterface[] {
  const {
    model,
    taskConfig = {},
    groups = TOOL_GROUP_NAMES,
    includeTask = false,
    exclude = [],
    include = [],
  } = options;

  const selected = groups.flatMap((group) => toolGroups[group] ?? []);

  if (includeTask) {
    if (!model) {
      throw new Error(
        "buildTools: `includeTask` requires a `model` so the subagent can be created."
      );
    }
    selected.push(createTaskTool(model, taskConfig) as StructuredToolInterface);
  }

  const excludeSet = new Set(exclude);
  const includeSet = new Set(include);

  const byName = new Map<string, StructuredToolInterface>();

  for (const t of selected) {
    const name = (t as any).name;
    if (!name) continue;

    // Drop excluded tools unless explicitly re-included.
    if (excludeSet.has(name) && !includeSet.has(name)) continue;

    // De-dupe by name (last definition wins) so a tool appended twice is safe.
    byName.set(name, t);
  }

  // Pull in explicitly requested tools that were not in the selected groups.
  if (include.length) {
    const lookup = new Map(tools.map((t) => [(t as any).name, t]));
    for (const name of include) {
      const t = lookup.get(name);
      if (t && !byName.has(name)) byName.set(name, t);
    }
  }

  return [...byName.values()];
}

// ---- Introspection ----------------------------------------------------------

export interface ToolManifestEntry {
  name: string;
  description: string;
  group: string;
}

/**
 * A compact `name → description` manifest of every registered tool, grouped.
 * Feed this to an LLM if you want it to reason about available capabilities,
 * or use it to render `/tools` in the CLI.
 */
export function getToolManifest(
  toolList: StructuredToolInterface[] = tools
): ToolManifestEntry[] {
  const groupOf = new Map<string, string>();
  for (const group of TOOL_GROUP_NAMES) {
    for (const t of toolGroups[group]) {
      const name = (t as any).name;
      if (name) groupOf.set(name, group);
    }
  }

  return toolList.map((t) => {
    const name = (t as any).name ?? "unknown";
    return {
      name,
      description: (t as any).description ?? "",
      group: groupOf.get(name) ?? "task",
    };
  });
}

/** Render the manifest as a plain-text block (handy for prompts and `/tools`). */
export function renderToolManifest(
  toolList: StructuredToolInterface[] = tools
): string {
  const manifest = getToolManifest(toolList);
  const byGroup = new Map<string, ToolManifestEntry[]>();

  for (const entry of manifest) {
    const list = byGroup.get(entry.group) ?? [];
    list.push(entry);
    byGroup.set(entry.group, list);
  }

  const lines: string[] = [`Tools (${manifest.length}):`];

  for (const [group, entries] of byGroup) {
    lines.push(`\n## ${group}`);
    for (const e of entries) {
      const firstLine = e.description.split("\n")[0].trim();
      lines.push(`- ${e.name}: ${firstLine}`);
    }
  }

  return lines.join("\n");
}

// Re-export groups and individual tools for advanced consumers.
export {
  bashTool,
  astAnalyzeTool,
  think_tool,
  filesystemTools,
  createReactProjectTool,
  gitTools,
  graphTools,
  ragTools,
  agentMemoryTools,
  write_todos,
  read_todos,
  update_todos,
  get_next_runnable_tasks,
  createTaskTool,
};
