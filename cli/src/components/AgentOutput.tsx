import React from "react";
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { store, useTuiState } from "../state/store.js";
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

/** Shown when the transcript is scrolled away from the live tail. */
function ScrollHint({ offset }: { offset: number }) {
  return (
    <Text wrap="truncate-end">
      <Text color="yellow">↓ </Text>
      <Text dimColor>
        scrolled up {offset} · PgUp/PgDn or Shift+↑/↓ · esc to return
      </Text>
    </Text>
  );
}

/**
 * Transcript view: finished log entries followed by the assistant text
 * currently streaming in.
 *
 * The log is windowed to the available height. `scrollOffset` (owned by the
 * store and driven by the CommandBar's keys) shifts that window up so earlier
 * output can be reviewed — including while the agent is still streaming.
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
  const scrollOffset = useTuiState((s) => s.scrollOffset);

  // Publish the window height so the store can page scroll and clamp offset.
  useEffect(() => {
    store.setViewportRows(height);
  }, [height]);

  const scrolled = scrollOffset > 0;

  // Window into the log: `end` trims entries hidden below, `start` above.
  const end = Math.max(0, log.length - scrollOffset);
  const start = Math.max(0, end - height);
  const visible = log.slice(start, end);

  // Streaming text occupies lines too; keep its tail on screen. When scrolled
  // up, the streaming line is hidden and a scroll hint takes its place.
  const perLine = Math.max(30, (width ?? 80) - INDENT.length);
  const streamLines =
    streaming && !scrolled
      ? Math.min(height - 1, Math.ceil(streaming.length / perLine) + 1)
      : 0;
  const reserved = streamLines + (scrolled ? 1 : 0);
  const trimmed =
    reserved > 0 && visible.length + reserved > height
      ? visible.slice(0, Math.max(0, height - reserved))
      : visible;

  return (
    <Box flexDirection="column">
      {trimmed.map((entry) => (
        <LogRow key={entry.id} entry={entry} />
      ))}
      {streaming && !scrolled ? <Streaming text={streaming} /> : null}
      {scrolled ? <ScrollHint offset={scrollOffset} /> : null}
    </Box>
  );
}
