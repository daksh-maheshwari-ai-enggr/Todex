import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * transferTool — a structured handoff signal.
 *
 * In the reference project this is implemented as a string marker
 * (`__TRANSFER__ + context`) that the orchestrator parses. This version
 * replaces that hack with a proper tool that returns a typed payload the
 * orchestrator can act on directly.
 *
 * When the orchestrator calls this tool it means: "I have decided this task
 * belongs to a specialist — here is the context, please route it."
 */
export const transferTool = tool(
  async ({ context, targetAgent, reason }) => {
    return JSON.stringify({
      action: "transfer",
      targetAgent,
      context,
      reason: reason ?? "Task delegated to a specialist agent.",
    });
  },
  {
    name: "transfer",
    description:
      "Signal that the current task should be handed off to a specialist agent. Use this when the task requires tools or expertise the orchestrator does not have. The orchestrator will route the context to the target agent.",
    schema: z.object({
      context: z.string().describe("Everything the target agent needs to continue — task description, relevant findings, constraints."),
      targetAgent: z.string().describe("Name of the specialist agent to hand off to (e.g. 'coder', 'reviewer', 'researcher')."),
      reason: z.string().optional().describe("Brief reason for the handoff."),
    }),
  }
);