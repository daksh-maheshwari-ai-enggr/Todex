import React from "react";
import { Box, Text } from "ink";
import { useTuiState } from "../state/store.js";
import type { LogEntry } from "../types/types.js";

function ToolRow({ entry }: { entry: LogEntry }) {
  const tool = entry.tool!;

  if (!tool.done) {
    return (
      <Text wrap="truncate-end">
        {"  "}
        <Text color="yellow">● </Text>
        <Text color="cyan">{tool.name}</Text>
        {tool.args ? <Text dimColor> {tool.args}</Text> : null}
      </Text>
    );
  }

  const seconds =
    tool.durationMs != null ? ` ${(tool.durationMs / 1000).toFixed(1)}s` : "";
  const args = tool.args ? ` ${tool.args}` : "";

  if (tool.failed) {
    const error = tool.errorMessage
      ? ` ${tool.errorMessage.replace(/\s+/g, " ").slice(0, 90)}`
      : "";
    return (
      <Text wrap="truncate-end">
        {"  "}
        <Text color="red">
          ✗ {tool.name}
          {args}
          {seconds}
        </Text>
        {error ? <Text color="red">{error}</Text> : null}
      </Text>
    );
  }

  return (
    <Text wrap="truncate-end">
      {"  "}
      <Text color="green">✓ </Text>
      <Text color="cyan">{tool.name}</Text>
      <Text dimColor>
        {args}
        {seconds}
      </Text>
    </Text>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  switch (entry.kind) {
    case "user":
      return (
        <Text wrap="truncate-end">
          <Text color="cyan" bold>
            ❯{" "}
          </Text>
          {entry.text}
        </Text>
      );

    case "assistant":
      return <Text>{entry.text}</Text>;

    case "tool":
      return entry.tool ? <ToolRow entry={entry} /> : null;

    case "error":
      return (
        <Text wrap="truncate-end" color="red">
          ✗ {entry.text}
        </Text>
      );

    default:
      return (
        <Text wrap="truncate-end" dimColor>
          {entry.text}
        </Text>
      );
  }
}

/**
 * Transcript view: finished log entries (windowed to the available height)
 * followed by the assistant text currently streaming in.
 */
export function AgentOutput({ height }: { height: number }) {
  const log = useTuiState((s) => s.log);
  const streaming = useTuiState((s) => s.streaming);

  const visible = log.length > height ? log.slice(log.length - height) : log;

  return (
    <Box flexDirection="column">
      {visible.map((entry) => (
        <LogRow key={entry.id} entry={entry} />
      ))}
      {streaming ? (
        <Box marginTop={1}>
          <Text color="magenta">✦ </Text>
          <Text>{streaming}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
