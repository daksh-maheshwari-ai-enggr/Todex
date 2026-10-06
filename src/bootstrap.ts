import "./env";

/**
 * Apply the `--dir` flag before any workspace-aware module is imported.
 *
 * `WORKING_DIR` (workspace.ts) is a module-level constant, so an override has
 * to be in `process.env` while the import graph is still evaluating. The
 * `parseFlags()` pass in index.ts runs after all imports have completed, so it
 * would land too late. index.ts therefore imports this module first.
 */
export function applyDirFlag(
  argv: string[] = process.argv.slice(2)
): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir") {
      const value = argv[i + 1];
      if (value) {
        process.env.AGENT_WORKING_DIR = value;
        return value;
      }
    }
  }
  return undefined;
}

applyDirFlag();
