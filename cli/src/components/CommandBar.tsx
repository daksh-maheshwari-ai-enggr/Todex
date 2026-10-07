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

  /**
   * Insert a typed or pasted chunk.
   *
   * Ink delivers a paste as a single multi-character `input`. We insert it
   * verbatim (newlines preserved) rather than treating embedded newlines as
   * Enter — which previously fired off a prompt in the middle of a paste.
   * Only a lone newline/CR (an explicit Enter, or terminals that send "\n")
   * submits the prompt.
   */
  const handleText = (raw: string) => {
    // Strip bracketed-paste markers in case the terminal emits them.
    const text = raw.replace(/\u001b\[20[01]~/g, "");
    if (!text) return;

    if (text === "\r" || text === "\n") {
      submitCurrent();
      return;
    }

    // Normalise CRLF/CR to LF so Windows-style pastes don't double-space.
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    let inserted = "";
    for (const ch of normalized) {
      if (ch === "\n" || ch === "\t" || ch >= " ") inserted += ch;
      // Other control characters are dropped.
    }

    if (inserted) put(valueRef.current + inserted);
  };

  // Raw mode (required for key-by-key input) only exists on a TTY; piping
  // stdin into the TUI should degrade to a read-only view, not crash.
  useInput(
    (input, key) => {
      // Transcript scrolling — works even while the agent is streaming.
      if (key.pageUp) {
        store.scrollPage("up");
        return;
      }

      if (key.pageDown) {
        store.scrollPage("down");
        return;
      }

      if (key.upArrow && key.shift) {
        store.scrollBy(1);
        return;
      }

      if (key.downArrow && key.shift) {
        store.scrollBy(-1);
        return;
      }

      if (key.escape) {
        store.scrollToBottom();
        return;
      }

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

      // Ignore remaining control/meta keys (ctrl+c is handled by Ink itself).
      if (key.ctrl || key.meta) return;

      handleText(input);
    },
    { isActive: isRawModeSupported === true }
  );

  const placeholder = busy ? "agent is working…" : "Ask anything, or type /help";

  // A multi-line paste would otherwise explode the input row, so collapse
  // newlines to a ↵ glyph and keep only the tail that fits the width.
  const lineCount = value ? value.split("\n").length : 0;
  const multiline = lineCount > 1;
  const flat = value.replace(/\n/g, " ↵ ");
  const columns = process.stdout.columns ?? 80;
  const cap = Math.max(24, columns - 12);
  const preview =
    flat.length > cap ? `…${flat.slice(flat.length - cap)}` : flat;

  return (
    <Box justifyContent="space-between">
      <Box>
        <Text color={busy ? "gray" : "cyan"} bold>
          ❯{" "}
        </Text>
        {value ? (
          <Text color="white">{preview}</Text>
        ) : (
          <Text dimColor>{placeholder}</Text>
        )}
        <Text color={busy ? "gray" : "cyan"}>▏</Text>
      </Box>
      <Text dimColor>
        {multiline ? `${lineCount} lines · enter ↵` : value ? "enter ↵" : ""}
      </Text>
    </Box>
  );
}
