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
["tool_name_one", "tool_name_two"]
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
    systemPrompt: `${TOOL_SELECTOR_PROMPT}\n\nAvailable tools:\n\n${manifest}`,
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
          content: `Task: ${task}`,
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
    const cleaned = text
      .replace(/```(?:json)?/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.filter((t) => typeof t === "string");
    }
    return [];
  } catch (error) {
    console.warn(
      `[ToolSelector] selection failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return [];
  }
}