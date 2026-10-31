import { createAgent } from "langchain";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";

import { createHandoffTool } from "./handoff";
import { transferTool } from "./transferTool";

/**
 * OrchestratorAgent — the top-level agent.
 *
 * It does not do the work itself. It decides whether a task can be handled
 * directly (with the full tool bag) or must be delegated to a specialist
 * via the handoff tool. This is the entry point for every user turn.
 *
 * Two tools only:
 *   - `handoff`  — delegate to a specialist with curated tools
 *   - `transfer` — signal a structured handoff with typed context
 */

export const ORCHESTRATOR_PROMPT = `
You are the orchestrator agent. Your job is to route tasks to the right
agent and keep the user informed.

Decision rules:
1. If the task is simple, direct, and within your own capabilities, handle
   it yourself using your available tools.
2. If the task requires specialised expertise or tools you do not have,
   delegate it to a specialist using the handoff tool.
3. When you delegate, pick the right role: coder, reviewer, researcher,
   or planner.
4. Always give the specialist a clear task and any context it needs.
5. After a handoff, summarise the specialist's result for the user.

You have access to the full tool set. Use it when the task is yours to do.
Delegating is not failure — it is the correct move when a specialist is
better equipped.
`.trim();

export type OrchestratorConfig = {
  model: BaseLanguageModel;
  selectorModel?: BaseLanguageModel;
};

/**
 * Build the orchestrator agent.
 *
 * The orchestrator gets the handoff and transfer tools plus the full tool
 * bag, so it can handle simple tasks directly and delegate complex ones.
 */
export function createOrchestrator(config: OrchestratorConfig) {
  const { model, selectorModel = model } = config;

  const handoffTool = createHandoffTool({ model, selectorModel });

  return createAgent({
    model,
    tools: [handoffTool, transferTool],
    systemPrompt: ORCHESTRATOR_PROMPT,
  });
}