import React from "react";
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useTuiState } from "../state/store.js";
import { toolVisual } from "../utils/toolDisplay.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Bottom status line: a compact live state on the left (spinner while the
 * agent works) and session context on the right.
 */
export function StatusBar() {
  const status = useTuiState((s) => s.status);
  const activeTool = useTuiState((s) => s.activeTool);
  const activeToolArg = useTuiState((s) => s.activeToolArg);
  const historyCount = useTuiState((s) => s.historyCount);
  const filesChanged = useTuiState((s) => s.filesChanged);

  const busy = status === "thinking" || status === "running";
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(
      () => setFrame((f) => (f + 1) % FRAMES.length),
      80
    );
    return () => clearInterval(timer);
  }, [busy]);

  const spinner = busy ? `${FRAMES[frame]} ` : "";

  let statusText: React.ReactNode;
  if (status === "running" && activeTool) {
    const { icon, color } = toolVisual(activeTool);
    statusText = (
      <>
        <Text color="yellow">{spinner}</Text>
        <Text color={color}>{icon} </Text>
        <Text>{activeTool}</Text>
        {activeToolArg ? <Text dimColor> {activeToolArg}</Text> : null}
      </>
    );
  } else if (status === "thinking") {
    statusText = <Text color="cyan">{spinner}thinking…</Text>;
  } else if (status === "error") {
    statusText = <Text color="red">✗ error</Text>;
  } else {
    statusText = <Text color="green">● ready</Text>;
  }

  return (
    <Box justifyContent="space-between">
      <Box>{statusText}</Box>
      <Box>
        {filesChanged.length > 0 ? (
          <Text dimColor>
            {filesChanged.length} file{filesChanged.length === 1 ? "" : "s"}{" "}
            changed ·{" "}
          </Text>
        ) : null}
        <Text dimColor>
          {historyCount} msg{historyCount === 1 ? "" : "s"} · ctrl+c
        </Text>
      </Box>
    </Box>
  );
}
