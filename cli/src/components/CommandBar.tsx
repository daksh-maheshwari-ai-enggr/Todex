import React from "react";
import { useRef, useState } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import { store, useTuiState } from "../state/store.js";

/**
 * Input line. Raw stdin is handled here (Ink's useInput) so the TUI needs
 * no extra dependency for text entry. Up/Down walk the submitted history.
 */
export function CommandBar() {
  const busy = useTuiState((s) => s.busy);
  const { isRawModeSupported } = useStdin();
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  // A single stdin chunk can both type text and submit it ("todo\r"), so
  // submit must see the value accumulated during this chunk — React state
  // updates are async within the handler, hence the ref as source of truth.
  const valueRef = useRef("");

  const put = (next: string) => {
    valueRef.current = next;
    setValue(next);
  };

  const submitCurrent = () => {
    const entry = valueRef.current.trim();
    if (!entry) return;
    if (submitted[submitted.length - 1] !== entry) {
      setSubmitted((prev) => [...prev, entry]);
    }
    put("");
    setHistoryIndex(null);
    void store.submit(entry);
  };

  // Raw mode (required for key-by-key input) only exists on a TTY; piping
  // stdin into the TUI should degrade to a read-only view, not crash.
  useInput(
    (input, key) => {
      if (key.upArrow) {
        if (submitted.length === 0) return;
        const index =
          historyIndex == null
            ? submitted.length - 1
            : Math.max(0, historyIndex - 1);
        setHistoryIndex(index);
        put(submitted[index]);
        return;
      }

      if (key.downArrow) {
        if (historyIndex == null) return;
        const index = historyIndex + 1;
        if (index >= submitted.length) {
          setHistoryIndex(null);
          put("");
        } else {
          setHistoryIndex(index);
          put(submitted[index]);
        }
        return;
      }

      if (key.return) {
        submitCurrent();
        return;
      }

      if (key.backspace || key.delete) {
        put(valueRef.current.slice(0, -1));
        return;
      }

      // Ignore control/meta keys (ctrl+c is handled by Ink itself).
      if (key.ctrl || key.meta || key.escape) return;

      // Pasted chunks can end with a terminator: process the chunk one
      // character at a time so "text\r" submits instead of inserting a
      // stray control character.
      for (const ch of input) {
        if (ch === "\r" || ch === "\n") {
          submitCurrent();
        } else if (ch === "\x7f") {
          put(valueRef.current.slice(0, -1));
        } else {
          put(valueRef.current + ch);
        }
      }
    },
    { isActive: isRawModeSupported === true }
  );

  const placeholder = busy ? "agent is working…" : "type a request or /help";

  return (
    <Box>
      <Text color={busy ? "gray" : "cyan"} bold>
        ❯{" "}
      </Text>
      {value ? <Text>{value}</Text> : <Text dimColor>{placeholder}</Text>}
      <Text color={busy ? "gray" : "cyan"}>▏</Text>
    </Box>
  );
}
