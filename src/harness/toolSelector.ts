import { createAgent } from "langchain";
import { renderToolManifest } from "../tools";

export const TOOL_SELECTOR_PROMPT = 
  "You are a tool selector agent. Your job is to pick the smallest set of " +
  "tools that can complete a given task.\n\n" +
  "You are given a manifest of every available tool, grouped by category.\n" +
  "Rules:\n" +
  "- Return ONLY a JSON array of tool names. No prose, no markdown fences.\n" +
  "- Pick the minimal set. Prefer 2–6 tools; never more than 10.\n" +
  "- If the task can be done without tools, return an empty array [].\n" +
  "- Never invent tool names that are not in the manifest.\n\n" +
  "Output format (exact):\n" +
  "[\"tool_name_one\", \"tool_name_two\"]";

export function createToolSelectorAgent(model: any) {
  const manifest = renderToolManifest();

  return createAgent({
    model,
    tools: [],
    systemPrompt: TOOL_SELECTOR_PROMPT + "\n\nAvailable tools:\n\n" + manifest,
  });
}

export async function selectTools(
  agent: ReturnType<typeof createToolSelectorAgent>,
  task: string
): Promise<string[]> {
  try {
    const result = await agent.invoke({
      messages: [
        {
          role: "user",
          content: "Task: " + task,
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
      .split(fence + "json")
      .join("")
      .split(fence)
      .join("")
      .trim();

    // Strategy 1: Look for all [...] blocks and try to parse them
    const arrayRegex = /\[[\s\S]*?\]/g;
    const matches = cleaned.match(arrayRegex) ?? [];
    
    for (const match of matches) {
      try {
        const candidate = JSON.parse(match);
        if (Array.isArray(candidate) && candidate.every((t: any) => typeof t === "string")) {
          return candidate;
        }
      } catch {
        // Continue to next match
      }
    }

    // Strategy 2: Look for { "tools": [...] }
    const objectRegex = /\{[\s\S]*?\}/g;
    const objMatches = cleaned.match(objectRegex) ?? [];
    for (const match of objMatches) {
      try {
        const candidate = JSON.parse(match);
        if (candidate && typeof candidate === "object" && Array.isArray(candidate.tools)) {
          return candidate.tools.filter((t: any) => typeof t === "string");
        }
      } catch {
        // Continue
      }
    }

    // Strategy 3: Fallback substring search
    const first = cleaned.indexOf("[");
    const close = cleaned.lastIndexOf("]");
    if (first >= 0 && close > first) {
      const substring = cleaned.slice(first, close + 1);
      try {
        const candidate = JSON.parse(substring);
        if (Array.isArray(candidate)) {
          return candidate.filter((t: any) => typeof t === "string");
        }
      } catch {
        // ignore
      }
    }

    return [];
  } catch (error) {
    console.warn(
      "[ToolSelector] selection failed: " + (error instanceof Error ? error.message : String(error))
    );
    return [];
  }
}
