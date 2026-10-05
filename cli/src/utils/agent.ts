import type { TuiBackend } from "../types/types.js";

let injected: TuiBackend | null = null;

/** Called by the entry point when the root package launches the TUI. */
export function setInjectedBackend(backend: TuiBackend | null): void {
  injected = backend;
}

/**
 * Resolve the agent backend.
 *
 * When launched via `todex --tui`, the root package injects the backend
 * directly. When the TUI is started standalone (`cd cli && npm run dev`),
 * we fall back to dynamically importing the root sources — that only works
 * under tsx (or with the root package built to dist/), hence the candidate
 * list. Specifiers are variables on purpose: the root sources live outside
 * this package's tsconfig rootDir and must stay out of its compilation.
 */
export async function loadBackend(): Promise<TuiBackend> {
  if (injected) return injected;

  const cliCandidates = ["../../../src/cli.js", "../../../dist/cli.js"];

  for (const cliSpec of cliCandidates) {
    try {
      const cli: any = await import(cliSpec);
      if (typeof cli?.runAgentTurn !== "function") continue;

      // agent/tools/model live next to the cli module we just loaded —
      // root src/ under tsx, root dist/ under a plain node build.
      const base = cliSpec.replace(/cli\.js$/, "");
      const agentSpec = `${base}agent.js`;
      const agentMod: any = await import(agentSpec);
      // `tools` is a directory module: compiled as tools/index.js, while
      // under tsx the .js specifier maps to src/tools/index.ts directly.
      const toolsSpec = `${base}tools.js`;
      const toolsIndexSpec = `${base}tools/index.js`;
      const toolsMod: any = await import(toolsSpec).catch(() =>
        import(toolsIndexSpec)
      );
      const modelSpec = `${base}model.js`;
      const modelMod: any = await import(modelSpec);
      const messagesMod: any = await import("@langchain/core/messages");

      return {
        createCodingAgent: agentMod.createCodingAgent,
        runAgentTurn: cli.runAgentTurn,
        trimHistory:
          typeof cli.trimHistory === "function"
            ? cli.trimHistory
            : (messages: unknown[]) => messages,
        renderToolManifest: () => toolsMod.renderToolManifest(),
        describeModelChain: () => modelMod.describeModelChain(),
        HumanMessage: messagesMod.HumanMessage,
      };
    } catch {
      // Try the next candidate path.
    }
  }

  throw new Error(
    "Could not load the Toodex agent backend. " +
      "Launch the TUI with `todex --tui` (or `npm run dev -- --tui`) from the project root."
  );
}
