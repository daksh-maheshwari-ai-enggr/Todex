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
      <Text bold color="white">
        todos{" "}
        <Text dimColor>
          {done}/{todos.length}
        </Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {todos.map((todo, index) => (
          <Box key={index}>
            <Text color={statusColor(todo.status)}>
              {GLYPHS[todo.status] ?? "○"}{" "}
            </Text>
            <Text
              wrap="truncate-end"
              color={todo.status === "completed" ? "green" : undefined}
              dimColor={todo.status === "pending"}
              strikethrough={todo.status === "completed"}
            >
              {todo.task}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
