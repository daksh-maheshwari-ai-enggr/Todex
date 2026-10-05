import React from "react";
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { AgentOutput } from "./components/AgentOutput.js";
import { CommandBar } from "./components/CommandBar.js";
import { StatusBar } from "./components/StatusBar.js";
import { TodoList } from "./components/TodoList.js";
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

function Header() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        todex <Text dimColor>· AI coding agent · TUI</Text>
      </Text>
      <Text dimColor>
        type a request, /help for commands · ctrl+c to quit
      </Text>
    </Box>
  );
}

/**
 * Full-screen layout:
 *
 *   ┌ header ────────────────────────────────┐
 *   │ transcript (scrolling window)  │ todos │
 *   ├ input ─────────────────────────────────┤
 *   └ status bar ────────────────────────────┘
 */
export function App() {
  const todos = useTuiState((s) => s.todos);
  const size = useTerminalSize();

  // Fixed chrome: header (2) + spacing (3) + input (1) + status (1).
  const logHeight = Math.max(4, size.rows - 7);

  return (
    <Box flexDirection="column">
      <Header />
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1} paddingRight={todos.length > 0 ? 1 : 0}>
          <AgentOutput height={logHeight} />
        </Box>
        {todos.length > 0 ? (
          <Box
            flexDirection="column"
            width={44}
            borderStyle="round"
            borderColor="gray"
            paddingX={1}
          >
            <TodoList />
          </Box>
        ) : null}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <CommandBar />
        <StatusBar />
      </Box>
    </Box>
  );
}
