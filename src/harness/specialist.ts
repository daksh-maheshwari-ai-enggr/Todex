import { createAgent } from "langchain";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { buildTools } from "../tools";

/**
 * SpecialistAgent — a focused agent that receives only the tools the
 * ToolSelector curated for its task.
 *
 * Roles are thin wrappers: same createAgent call, different systemPrompt
 * and different tool set. Add a role by adding an entry to SPECIALIST_ROLES.
 */

export type SpecialistRole = "coder" | "reviewer" | "researcher" | "planner";

export const SPECIALIST_ROLES: Record<SpecialistRole, string> = {
  coder: `You are a coding specialist. You write, modify, and refactor code.

Rules:
- Read before you edit. Never guess file contents.
- Make the smallest change that solves the task.
- After every code change, run the relevant build/typecheck/tests.
- Verify before reporting success.
- Explain what you did and why when you finish.`,

  reviewer: `You are a review specialist. You inspect code for correctness,
  security issues, and adherence to project conventions.

Rules:
- Use AST analysis and the import graph to understand structure before
  reviewing.
- Report findings as a structured list: file, line, severity, issue, fix.
- Do not modify code — only report.`,

  researcher: `You are a research specialist. You explore the codebase and
  gather information.

Rules:
- Use RAG (query_codebase), AST analysis, and the import graph.
- Prefer ast_analyze over reading whole files.
- Return a concise structured report with findings and file references.`,

  planner: `You are a planning specialist. You break a task into a TODO
  list with dependencies.

Rules:
- Use write_todos to create the plan.
- Every task gets a unique UUID and a status.
- Identify dependencies between tasks.
- Return the TODO list filename and a summary of the plan.`,
};

/**
 * Build a specialist agent for a given role with a curated tool set.
 *
 * `tools` is the list the ToolSelector returned. When empty the specialist
 * falls back to a sensible default subset for its role.
 */
export function createSpecialist(options: {
  model: any;
  role: SpecialistRole;
  tools?: string[];
  systemPrompt?: string;
}) {
  const { model, role, tools = [], systemPrompt } = options;

  const prompt =
    systemPrompt ?? SPECIALIST_ROLES[role] ?? SPECIALIST_ROLES.coder;

  const toolSet: StructuredToolInterface[] = tools.length
    ? buildTools({ include: tools })
    : buildTools({ groups: defaultGroupsFor(role) });

  return createAgent({
    model,
    tools: toolSet,
    systemPrompt: prompt,
  });
}

/** Sensible default tool groups when the selector returns nothing. */
function defaultGroupsFor(role: SpecialistRole): string[] {
  switch (role) {
    case "coder":
      return ["filesystem", "shell", "git", "ast", "graph", "todo"];
    case "reviewer":
      return ["filesystem", "ast", "graph", "rag"];
    case "researcher":
      return ["rag", "ast", "graph", "filesystem"];
    case "planner":
      return ["todo", "filesystem"];
    default:
      return ["filesystem", "ast", "graph"];
  }
}

/** Resolve a role name string to a SpecialistRole (fail-open to 'coder'). */
export function resolveRole(name: string): SpecialistRole {
  const normalized = name.toLowerCase().trim() as SpecialistRole;
  return normalized in SPECIALIST_ROLES ? normalized : "coder";
}