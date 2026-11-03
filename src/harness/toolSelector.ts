import { createAgent } from "langchain";
import { z } from "zod";
import { getToolManifest, renderToolManifest } from "../tools";

/**
 * ToolSelectorAgent — picks the minimal tool subset for a task.
 *
 * Instead of every agent seeing the full tool bag, the orchestrator asks
 * this lightweight agent to curate a list. The specialist then receives
 * only those tools, which keeps its context small and its behaviour
 * predictable.
 *
 * The agent reads the tool manifest (name + one-line description, already
 * built in `src/tools/index.ts`) and returns a JSON list of tool names.
 */

export const TOOL_SELECTOR_PROMPT = `
You are a tool selector agent. Your job is to pick the smallest set of
tools that can complete a given task.

You are given a manifest of every available tool, grouped by category.
Each entry is: name — one-line description.

Rules:
- Return ONLY a JSON array of tool names. No prose, no markdown fences.
- Pick the minimal set. Prefer 2–6 tools; never more than 10.
- If the task can be done without tools, return an empty array [].
- Never invent tool names that are not in the manifest.
- If a task needs a tool that is not listed, say so by returning an empty
  array and the orchestrator will fall back to the full set.

Output format (exact):

Return ONLY a JSON array of tool names. No prose, no markdown fences, no explanations.

Examples:
- ["read_file", "bash"]
- ["query_codebase", "ast_analyze"]
- []

Never return:
- "I'll use these tools: ["read_file", "bash"]"
- ```json
- "The tools I need are:"

Just the array.
`.trim();

export type ToolSelectorResult = {
  tools: string[];
  reasoning?: string;
};

/**
 * Build the tool selector agent.
 *
 * `model` should be a fast/cheap model — selection is a small bounded task
 * and does not need the main reasoning model.
 */
export function createToolSelectorAgent(model: any) {
  const manifest = renderToolManifest();

  return createAgent({
    model,
    tools: [],
    systemPrompt: `${ TOOL_SELECTOR_PROMPT } \n\nAvailable tools: \n\n${ manifest } `,
  });
}

/**
 * Ask the tool selector to curate a tool list for a task.
 *
 * Returns the tool names, or an empty array when the agent could not
 * decide (fail-open — the caller falls back to the full tool set).
 */
export async function selectTools(
  agent: ReturnType<typeof createToolSelectorAgent>,
  task: string
): Promise<string[]> {
  try {
    const result = await agent.invoke({
      messages: [
        {
          role: "user",
          content: `Task: ${ task } `,
        },
      ],
    });

    const messages = (result as any).messages ?? [];
    const last = messages[messages.length - 1];
    const content = last?.content;

    let text = "";
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .map((part: any) =>
          typeof part === "string" ? part : part?.text ?? ""
        )
        .join("");
    }

    // Strip markdown fences if the model added them.
    const fence = "```";
const cleaned = text
  .replace(new RegExp(fence + "json", "g"), "")
  .replace(new RegExp(fence, "g"), "")
  .trim();

// Extract JSON from prose using multiple strategies
// We look for the first string that actually parses as an array of strings.
let parsed: any = null;

// Strategy 1: Look for all [...] blocks and try to parse them
const arrayRegex = /\[[\s\S]*?\]/g;
const matches = cleaned.match(arrayRegex) ?? [];

for (const match of matches) {
  try {
    const candidate = JSON.parse(match);
    if (Array.isArray(candidate) && candidate.every(t => typeof t === "string")) {
      parsed = candidate;
      break;
    }
  } catch {
    // Continue to next match
  }
}

// Strategy 2: If no simple array found, look for { "tools": [...] }
if (!parsed) {
  const objectRegex = /\{[\s\S]*?\}/g;
  const objMatches = cleaned.match(objectRegex) ?? [];
  for (const match of objMatches) {
    try {
      const candidate = JSON.parse(match);
      if (candidate && typeof candidate === "object" && Array.isArray(candidate.tools)) {
        parsed = candidate.tools.filter((t: any) => typeof t === "string");
        break;
      }
    } catch {
      // Continue
    }
  }
}

// Strategy 3: Heuristic fallback for common "prose + JSON" patterns
if (!parsed) {
  // Try to find the longest substring that parses as an array
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    const candidateStr = cleaned.slice(firstBracket, lastBracket + 1);
    try {
      const candidate = JSON.parse(candidateStr);
      if (Array.isArray(candidate)) {
        parsed = candidate.filter(t => typeof t === "string");
      }
    } catch {
      // Still failing
    }
  }
}

if (parsed) {
  return parsed;
}

// Last resort: regex for ["a", "b"]
const jsonArrayMatch = cleaned.match(/\[\s*"[^"]*"\s*(?:,\s*"[^"]*")*\s*\]/);
if (jsonArrayMatch) {
  try {
    const extracted = JSON.parse(jsonArrayMatch[0]);
    return extracted.filter((t: any) => typeof t === "string");
  } catch { }
}

// Fallback: return empty array
return [];
  } catch (error) {
  console.warn(
    `[ToolSelector] selection failed: ${error instanceof Error ? error.message : String(error)}`
  );
  return [];
}
}