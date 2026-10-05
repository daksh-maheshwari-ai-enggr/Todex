import React from "react";
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useTuiState } from "../state/store.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Bottom status line: live agent status, the model fallback chain and the
 * size of the conversation context.
 */
export function StatusBar() {
  const status = useTuiState((s) => s.status);
  const activeTool = useTuiState((s) => s.activeTool);
  const modelInfo = useTuiState((s) => s.modelInfo);
  const historyCount = useTuiState((s) => s.historyCount);

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

  let statusText: string;
  let statusColor: string;
  if (status === "running" && activeTool) {
    statusText = `running ${activeTool}`;
    statusColor = "yellow";
  } else if (status === "thinking") {
    statusText = "thinking…";
    statusColor = "cyan";
  } else if (status === "error") {
    statusText = "error";
    statusColor = "red";
  } else {
    statusText = "idle";
    statusColor = "green";
  }

  // The model chain can be a multi-line listing — keep the status bar to
  // a single summary line that always fits an 80-column terminal together
  // with the left-hand status segment.
  const firstLine = (modelInfo.split("\n")[0] ?? modelInfo).replace(/\s+/g, " ").trim();
  const model = firstLine.length > 36 ? firstLine.slice(0, 35) + "…" : firstLine;

  return (
    <Box justifyContent="space-between">
      <Box>
        {busy ? (
          <Text color={statusColor}>
            {FRAMES[frame]} {statusText}
          </Text>
        ) : (
          <Text color={statusColor}>● {statusText}</Text>
        )}
        <Text dimColor>
          {" "}
          · {historyCount} msg{historyCount === 1 ? "" : "s"}
        </Text>
      </Box>
      <Box>
        <Text dimColor>{model}</Text>
        <Text dimColor> · ctrl+c exit</Text>
      </Box>
    </Box>
  );
}
