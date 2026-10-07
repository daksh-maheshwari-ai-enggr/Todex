import type { TuiBackend } from "../types/types.js";

let injected: TuiBackend | null = null;

/**
 * Called by the root launcher when it wants to provide
 * the backend directly.
 */
export function setInjectedBackend(backend: TuiBackend | null): void {
  injected = backend;
}

/**
 * Load the Todex backend.
 *
 * The Ink CLI can run in two ways:
 *
 * 1. Through the main `todex` command.
 * 2. Standalone from inside the `cli` package.
 *
 * In both cases the actual agent implementation lives
 * in the root `src/` directory.
 */
export async function loadBackend(): Promise<TuiBackend> {
  if (injected) {
    return injected;
  }

  /**
   * runtime.ts contains:
   * - runAgentTurn
   * - trimHistory
   * - renderToolManifest
   * - describeModelChain
   *
   * agent.ts contains:
   * - createCodingAgent
   *
   * model.ts contains:
   * - model configuration
   */
  const runtimeCandidates = [
    "../../../src/runtime.js",
    "../../../dist/runtime.js",
  ];

  for (const runtimeSpec of runtimeCandidates) {
    try {
      const runtime: any = await import(runtimeSpec);

      if (typeof runtime?.runAgentTurn !== "function") {
        continue;
      }

      const base = runtimeSpec.replace(/runtime\.js$/, "");

      const agentSpec = `${base}agent.js`;
      const modelSpec = `${base}model.js`;

      const agentMod: any = await import(agentSpec);
      const modelMod: any = await import(modelSpec);

      const messagesMod: any = await import(
        "@langchain/core/messages"
      );

      return {
        createCodingAgent: agentMod.createCodingAgent,

        runAgentTurn: runtime.runAgentTurn,

        trimHistory:
          typeof runtime.trimHistory === "function"
            ? runtime.trimHistory
            : (messages: any[]) => messages,

        renderToolManifest:
          typeof runtime.renderToolManifest === "function"
            ? runtime.renderToolManifest
            : () => "No tools registered.",

        describeModelChain:
          typeof runtime.describeModelChain === "function"
            ? runtime.describeModelChain
            : () => "Configured model",

        HumanMessage: messagesMod.HumanMessage,
      };
    } catch {
      // Try the next backend candidate.
    }
  }

  throw new Error(
    "Could not load the Todex agent backend. " +
      "Make sure the root project is built before launching the standalone TUI."
  );
}