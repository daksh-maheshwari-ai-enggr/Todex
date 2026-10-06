import React from "react";
import { Box, Text } from "ink";
import { useTuiState } from "../state/store.js";

const GLYPHS: Record<string, string> = {
  completed: "✓",
  in_progress: "◉",
  pending: "○",
  blocked: "✗",
};

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "green";
    case "in_progress":
      return "cyan";
    case "blocked":
      return "red";
    default:
      return "gray";
  }
}

/** Compact progress bar for the todo panel header. */
function ProgressBar({ done, total }: { done: number; total: number }) {
  const width = 18;
  const filled = total > 0 ? Math.round((done / total) * width) : 0;
  return (
    <Text>
      <Text color="green">{"▰".repeat(filled)}</Text>
      <Text dimColor>{"▱".repeat(width - filled)}</Text>
    </Text>
  );
}

/**
 * Side panel showing the agent's live TODO list (synced from the agent's
 * `.agent-todos` files after every write_todos / update_todos tool call).
 */
export function TodoList() {
  const todos = useTuiState((s) => s.todos);

  if (todos.length === 0) return null;

  const done = todos.filter((t) => t.status === "completed").length;

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color="white">
          plan
        </Text>
        <Text dimColor>
          {done}/{todos.length}
        </Text>
      </Box>
      <Box marginTop={1}>
        <ProgressBar done={done} total={todos.length} />
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {todos.map((todo, index) => (
          <Box key={index}>
            <Text color={statusColor(todo.status)}>
              {GLYPHS[todo.status] ?? "○"}{" "}
            </Text>
            <Text
              wrap="truncate-end"
              color={
                todo.status === "in_progress"
                  ? "white"
                  : todo.status === "completed"
                    ? "green"
                    : undefined
              }
              dimColor={todo.status === "pending"}
              strikethrough={todo.status === "completed"}
              bold={todo.status === "in_progress"}
            >
              {todo.task}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** Files written/edited by tools during this session. */
export function ChangedFiles() {
  const filesChanged = useTuiState((s) => s.filesChanged);

  if (filesChanged.length === 0) return null;

  const shown = filesChanged.slice(-12);
  const hidden = filesChanged.length - shown.length;

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color="white">
          changed
        </Text>
        <Text dimColor>{filesChanged.length}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {hidden > 0 ? <Text dimColor>+{hidden} more…</Text> : null}
        {shown.map((file, index) => (
          <Text key={index} color="green" wrap="truncate-end">
            <Text color="green">✎ </Text>
            <Text color="white">{file}</Text>
          </Text>
        ))}
      </Box>
    </Box>
  );
}
