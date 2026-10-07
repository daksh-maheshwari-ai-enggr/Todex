import React from "react";
import { useRef, useState } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import { store } from "../state/store.js";

/** Glyph used to mask every typed character of the API key. */
const MASK = "•";

/**
 * First-run setup screen.
 *
 * Shown before any normal TUI interaction when no provider API key has been
 * configured (see `store.setupRequired`). It stays entirely inside Ink — no
 * readline — so it shares the same raw-mode input handling as the CommandBar.
 *
 * On submit the key is persisted through the injected backend (which wraps
 * `src/config.ts`, writing `~/.config/todex/config.json` with 0600). The store
 * then clears `setupRequired` and `App` re-renders into the normal interface.
 */
export function SetupScreen() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { isRawModeSupported } = useStdin();

  // A single stdin chunk can type and submit at once ("key\r"), so the ref is
  // the source of truth during a handler — React state updates are async.
  const valueRef = useRef("");

  const put = (next: string) => {
    valueRef.current = next;
    setValue(next);
  };

  const submit = () => {
    const key = valueRef.current.trim();
    if (!key) {
      setError("API key cannot be empty.");
      return;
    }

    setError(null);
    const saved = store.saveApiKey(key);
    if (saved) {
      put("");
      // store.saveApiKey() flips setupRequired; App swaps in the main view.
    } else {
      setError(
        "Could not save the API key. Check permissions for ~/.config/todex."
      );
    }
  };

  useInput(
    (input, key) => {
      if (key.escape || (key.ctrl && input === "c")) {
        store.exit();
        return;
      }

      if (key.return) {
        submit();
        return;
      }

      if (key.backspace || key.delete) {
        put(valueRef.current.slice(0, -1));
        return;
      }

      // Ignore other control/meta keys (ctrl+c is handled above).
      if (key.ctrl || key.meta) return;

      // Pasted chunks can end with a terminator: walk the chunk one character
      // at a time so "key\r" submits instead of inserting a control character.
      for (const ch of input) {
        if (ch === "\r" || ch === "\n") {
          submit();
        } else if (ch === "\x7f") {
          put(valueRef.current.slice(0, -1));
        } else if (ch >= " ") {
          put(valueRef.current + ch);
        }
      }
    },
    { isActive: isRawModeSupported === true }
  );

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color="cyan" bold>
        Welcome to Todex
      </Text>

      <Box marginTop={1}>
        <Text bold>FreeLLMAPI API key required</Text>
      </Box>

      <Box marginTop={1}>
        <Text>Enter API key: </Text>
        <Text color="white">{MASK.repeat(value.length)}</Text>
        <Text color="cyan">▏</Text>
      </Box>

      {error ? (
        <Box marginTop={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
      ) : null}

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          Saved globally to ~/.config/todex/config.json (0600) — no project .env
          needed.
        </Text>
        <Text dimColor>Enter to save and continue · esc to exit</Text>
      </Box>
    </Box>
  );
}
