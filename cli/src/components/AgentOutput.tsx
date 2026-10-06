import React from "react";
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useTuiState } from "../state/store.js";
import type { LogEntry } from "../types/types.js";
import { toolVisual } from "../utils/toolDisplay.js";

/** Indentation shared by everything that hangs off the transcript rail. */
const INDENT = "  ";

/** A tool call line: icon + name + args + duration / error. */
function ToolRow({ entry }: { entry: LogEntry }) {
  const tool = entry.tool!;
  const { icon, color } = toolVisual(tool.name);

  if (!tool.done) {
    return (
      <Text wrap="truncate-end">
        {INDENT}
        <Text color={color}>{icon} </Text>
        <Text color="white">{tool.name}</Text>
        {tool.args ? <Text dimColor> {tool.args}</Text> : null}
        <Text dimColor> …</Text>
      </Text>
    );
  }

  if (tool.failed) {
    const error = tool.errorMessage
      ? ` ${tool.errorMessage.replace(/\s+/g, " ").slice(0, 100)}`
      : "";
    return (
      <Text wrap="truncate-end">
        {INDENT}
        <Text color="red">✗ {tool.name}</Text>
        {tool.args ? <Text dimColor> {tool.args}</Text> : null}
        {error ? <Text color="red">{error}</Text> : null}
      </Text>
    );
  }

  const seconds =
    tool.durationMs != null ? ` · ${(tool.durationMs / 1000).toFixed(1)}s` : "";

  return (
    <Text wrap="truncate-end">
      {INDENT}
      <Text color={color}>{icon} </Text>
      <Text color="white">{tool.name}</Text>
      {tool.args ? <Text dimColor> {tool.args}</Text> : null}
      <Text dimColor>{seconds}</Text>
    </Text>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  switch (entry.kind) {
    case "user":
      return (
        <Box marginTop={1}>
          <Text color="cyan" bold>
            ❯{" "}
          </Text>
          <Text bold>{entry.text}</Text>
        </Box>
      );

    case "assistant":
      return (
        <Box marginTop={1}>
          <Text>{INDENT}</Text>
          <Text>{entry.text}</Text>
        </Box>
      );

    case "tool":
      return entry.tool ? <ToolRow entry={entry} /> : null;

    case "error":
      return (
        <Box marginTop={1}>
          <Text color="red" wrap="truncate-end">
            {INDENT}✗ {entry.text}
          </Text>
        </Box>
      );

    default:
      return (
        <Text wrap="truncate-end">
          {INDENT}
          <Text dimColor>· {entry.text}</Text>
        </Text>
      );
  }
}

/** Blinking caret shown while assistant text is still streaming in. */
function Streaming({ text }: { text: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const timer = setInterval(() => setOn((v) => !v), 500);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box marginTop={1}>
      <Text>{INDENT}</Text>
      <Text>{text}</Text>
      <Text color="magenta">{on ? "▌" : " "}</Text>
    </Box>
  );
}

/**
 * Transcript view: finished log entries (windowed to the available height)
 * followed by the assistant text currently streaming in.
 */
export function AgentOutput({
  height,
  width,
}: {
  height: number;
  width?: number;
}) {
  const log = useTuiState((s) => s.log);
  const streaming = useTuiState((s) => s.streaming);

  const visible = log.length > height ? log.slice(log.length - height) : log;
  // Streaming text occupies lines too; keep the tail on screen.
  const perLine = Math.max(30, (width ?? 80) - INDENT.length);
  const streamLines = streaming
    ? Math.min(height - 1, Math.ceil(streaming.length / perLine) + 1)
    : 0;
  const trimmed =
    streamLines > 0 && visible.length + streamLines > height
      ? visible.slice(0, height - streamLines)
      : visible;

  return (
    <Box flexDirection="column">
      {trimmed.map((entry) => (
        <LogRow key={entry.id} entry={entry} />
      ))}
      {streaming ? <Streaming text={streaming} /> : null}
    </Box>
  );
}
