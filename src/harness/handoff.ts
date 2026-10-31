import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage } from "@langchain/core/messages";

import { createToolSelectorAgent, selectTools } from "./toolSelector";
import { createSpecialist, resolveRole, type SpecialistRole } from "./specialist";

/**
 * handoff — delegate a task to a specialist agent.
 *
 * The orchestrator calls this when a task needs tools or expertise it does
 * not have. The handoff tool:
 *
 * 1. Asks the ToolSelectorAgent to curate a tool list for the task.
 * 2. Builds a specialist agent for the requested role with only those tools.
 * 3. Runs the specialist against the task in an isolated context.
 * 4. Returns the specialist's final text to the orchestrator.
 *
 * This is the core of the handoff pattern: the orchestrator never touches
 * the specialist's tools directly — it only routes work.
 */
export function createHandoffTool(options: {
  model: any;
  selectorModel?: any;
}) {
  const { model, selectorModel = model } = options;
  const selector = createToolSelectorAgent(selectorModel);

  return tool(
    async ({ task, role, context }, toolConfig: any) => {
      try {
        const specialistRole = resolveRole(role);

        // 1. Curate the minimal tool set for this task.
        const selectedTools = await selectTools(selector, task);
        const toolListNote = selectedTools.length
          ? `Tools selected for this task: ${selectedTools.join(", ")}.`
          : "No specific tools selected — using role defaults.";

        // 2. Build the specialist with only those tools.
        const specialist = createSpecialist({
          model,
          role: specialistRole,
          tools: selectedTools,
        });

        // 3. Run the specialist in an isolated context.
        const fullPrompt = [
          `Task: ${task}`,
          context ? `Context: ${context}` : "",
          toolListNote,
        ]
          .filter(Boolean)
          .join("\n\n");

        const result = await specialist.invoke(
          { messages: [new HumanMessage(fullPrompt)] },
          { ...toolConfig }
        );

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

        return (
          `✅ Handoff to ${specialistRole} complete.\n\n${text || "(no output)"}`
        );
      } catch (error) {
        return `❌ Handoff failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: "handoff",
      description:
        "Delegate a task to a specialist agent (coder, reviewer, researcher, or planner). The specialist gets only the tools it needs for this task. Use this when the task requires expertise or tools you do not have.",
      schema: z.object({
        task: z.string().describe("The task for the specialist to complete."),
        role: z
          .string()
          .describe(
            "Specialist role: 'coder', 'reviewer', 'researcher', or 'planner'."
          ),
        context: z
          .string()
          .optional()
          .describe("Any context the specialist needs to start."),
      }),
    }
  );
}