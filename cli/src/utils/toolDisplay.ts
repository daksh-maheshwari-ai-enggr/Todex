/**
 * Presentation metadata for tool calls — icons, colors and the changed-file
 * extraction used by the transcript and the header context.
 *
 * Pure TUI concerns: nothing here touches the agent backend.
 */

export interface ToolVisual {
  icon: string;
  color: string;
}

/**
 * Per-tool glyph + color. Grouped by intent so the transcript reads at a
 * glance: reads are cyan, writes green, shell magenta, git yellow, etc.
 */
const VISUALS: Record<string, ToolVisual> = {
  // --- filesystem: read ------------------------------------------------
  read_file: { icon: "→", color: "cyan" },
  list_dir: { icon: "▸", color: "cyan" },
  file_tree: { icon: "≡", color: "cyan" },
  search_file: { icon: "⌕", color: "cyan" },

  // --- filesystem: write ----------------------------------------------
  write_file: { icon: "✚", color: "green" },
  edit_file: { icon: "✎", color: "green" },
  create_react_project: { icon: "⚛", color: "green" },

  // --- shell ------------------------------------------------------------
  bash: { icon: "$", color: "magenta" },

  // --- git --------------------------------------------------------------
  git_diff: { icon: "±", color: "yellow" },
  git_log: { icon: "≡", color: "yellow" },
  git_status: { icon: "⑂", color: "yellow" },

  // --- graph / analysis -------------------------------------------------
  build_import_graph: { icon: "⬡", color: "blue" },
  query_import_graph: { icon: "⬡", color: "blue" },
  impact_analysis: { icon: "◎", color: "blue" },
  ast_analyze: { icon: "✦", color: "blue" },

  // --- semantic search / rag -------------------------------------------
  embed_codebase: { icon: "◈", color: "blue" },
  query_codebase: { icon: "◈", color: "blue" },

  // --- memory -----------------------------------------------------------
  read_agent_index: { icon: "❖", color: "gray" },
  update_agent_index: { icon: "❖", color: "gray" },
  read_agent_module: { icon: "❖", color: "gray" },
  write_agent_module: { icon: "❖", color: "gray" },
  list_agent_modules: { icon: "❖", color: "gray" },
  read_embeddings_index: { icon: "❖", color: "gray" },

  // --- todo -------------------------------------------------------------
  write_todos: { icon: "☐", color: "cyan" },
  read_todos: { icon: "☐", color: "cyan" },
  update_todos: { icon: "☐", color: "cyan" },
  get_next_runnable_tasks: { icon: "☐", color: "cyan" },

  // --- reasoning --------------------------------------------------------
  think_tool: { icon: "✻", color: "gray" },
};

const DEFAULT_VISUAL: ToolVisual = { icon: "•", color: "cyan" };

export function toolVisual(name: string): ToolVisual {
  return VISUALS[name] ?? DEFAULT_VISUAL;
}

/** Tools whose successful run means a file on disk changed. */
const WRITE_TOOLS = new Set([
  "write_file",
  "edit_file",
  "create_react_project",
]);

/**
 * Extract the path a write/edit tool targeted, for the "changed files"
 * context. Returns null for non-writing tools or unknown shapes.
 */
export function changedPath(
  toolName: string,
  input: unknown
): string | null {
  if (!WRITE_TOOLS.has(toolName)) return null;
  if (input == null || typeof input !== "object") return null;

  const args = input as Record<string, unknown>;
  for (const key of ["file_path", "path", "filename", "directory", "name"]) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
