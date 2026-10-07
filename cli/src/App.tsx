import React from "react";
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { AgentOutput } from "./components/AgentOutput.js";
import { CommandBar } from "./components/CommandBar.js";
import { SetupScreen } from "./components/SetupScreen.js";
import { StatusBar } from "./components/StatusBar.js";
import { TodoList, ChangedFiles } from "./components/TodoList.js";
import { useTuiState } from "./state/store.js";

/** Track terminal size so the transcript window fits the screen. */
function useTerminalSize() {
  const [size, setSize] = useState({
    rows: process.stdout.rows ?? 24,
    columns: process.stdout.columns ?? 80,
  });

  useEffect(() => {
    const onResize = () =>
      setSize({
        rows: process.stdout.rows ?? 24,
        columns: process.stdout.columns ?? 80,
      });
    process.stdout.on("resize", onResize);
    return () => {
      process.stdout.off("resize", onResize);
    };
  }, []);

  return size;
}

/** Shorten the home directory to `~` so the header stays compact. */
function prettyPath(value: string): string {
  const home = process.env.HOME;
  if (home && (value === home || value.startsWith(home + "/"))) {
    return "~" + value.slice(home.length);
  }
  return value;
}

function firstLine(value: string): string {
  const line = (value.split("\n")[0] ?? value).replace(/\s+/g, " ").trim();
  return line.length > 40 ? line.slice(0, 39) + "…" : line;
}

/**
 * Compact two-line header:
 *
 *   ◈ todex  ·  AI coding agent                        FreeLLMAPI · auto
 *   ~/code/my-project  ·  ⑂ main  ·  ±2 changed
 *   ─────────────────────────────────────────────────────────────────
 */
function Header({ width }: { width: number }) {
  const modelInfo = useTuiState((s) => s.modelInfo);
  const workspace = useTuiState((s) => s.workspace);
  const gitBranch = useTuiState((s) => s.gitBranch);
  const gitChanges = useTuiState((s) => s.gitChanges);

  return (
    <Box flexDirection="column" width={width}>
      <Box justifyContent="space-between">
        <Box>
          <Text color="cyan" bold>
            ◈ todex
          </Text>
          <Text dimColor> · AI coding agent</Text>
        </Box>
        <Text dimColor>{firstLine(modelInfo)}</Text>
      </Box>

      <Box>
        <Text color="white">{prettyPath(workspace)}</Text>
        {gitBranch ? (
          <Text dimColor>
            {" "}
            · <Text color="magenta">⑂ {gitBranch}</Text>
          </Text>
        ) : null}
        {gitBranch && gitChanges > 0 ? (
          <Text color="yellow">
            {" "}
            · ±{gitChanges}
          </Text>
        ) : null}
      </Box>

      <Text dimColor>{"─".repeat(Math.max(1, width))}</Text>
    </Box>
  );
}

/** Thin full-width rule used above the input bar. */
function Rule({ width }: { width: number }) {
  return <Text dimColor>{"─".repeat(Math.max(1, width))}</Text>;
}

/**
 * Full-screen layout:
 *
 *   header (brand · model / workspace · git)
 *   ─────────────────────────────────────────
 *   transcript (scrolling window)   │ context
 *   ─────────────────────────────────────────
 *   ❯ input
 *   status
 */
/**
 * Root view. Keeps a stable hook order by gating the setup screen *before*
 * mounting the main view: `MainView` owns all of the workspace/git hooks, so
 * switching between the two never changes this component's hook count.
 */
export function App() {
  const setupRequired = useTuiState((s) => s.setupRequired);
  return setupRequired ? <SetupScreen /> : <MainView />;
}

function MainView() {
  const todos = useTuiState((s) => s.todos);
  const filesChanged = useTuiState((s) => s.filesChanged);
  const size = useTerminalSize();

  const showPanel = todos.length > 0 || filesChanged.length > 0;
  const panelWidth = 38;
  const transcriptWidth = showPanel
    ? Math.max(20, size.columns - panelWidth - 2)
    : size.columns;

  // Fixed chrome: header (3) + margins (2) + rule (1) + input (1) + status (1).
  const logHeight = Math.max(4, size.rows - 8);

  return (
    <Box flexDirection="column" width={size.columns}>
      <Header width={size.columns} />

      <Box flexDirection="row" marginTop={1}>
        <Box width={transcriptWidth} flexDirection="column" paddingRight={showPanel ? 1 : 0}>
          <AgentOutput height={logHeight} width={transcriptWidth} />
        </Box>
        {showPanel ? (
          <Box
            flexDirection="column"
            width={panelWidth}
            borderStyle="round"
            borderColor="gray"
            paddingX={1}
          >
            <TodoList />
            {todos.length > 0 && filesChanged.length > 0 ? (
              <Box marginTop={1} />
            ) : null}
            <ChangedFiles />
          </Box>
        ) : null}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Rule width={size.columns} />
        <CommandBar />
        <StatusBar />
      </Box>
    </Box>
  );
}
