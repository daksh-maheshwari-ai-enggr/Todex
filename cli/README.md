# Toodex CLI — Full-screen TUI (Ink)

A modern, full-screen terminal interface for Toodex built with
[Ink](https://github.com/vadimdemedes/ink) (React for the terminal). It shows
the agent's live TODO list, streams assistant output, renders tool execution
status, and takes input — all in one layout.

```
◈ todex · AI coding agent                 FreeLLMAPI · auto
~/code/project · ⑂ main · ±2
──────────────────────────────────────────────────────────
                                          ╭────────────────╮
  · Agent backend ready.                  │ plan       2/5 │
  ❯ add a healthcheck endpoint            │ ▰▰▰▰▱▱▱▱       │
  ✎ edit_file src/server.ts · 0.3s        │ ◉ wire route   │
  $ bash npm test · 1.2s                  │ ○ add tests    │
                                          │ changed     1  │
  Added the endpoint and wired it up.     │ ✎ src/server.ts│
──────────────────────────────────────────╰────────────────╯
❯ Ask anything, or type /help▏
● ready · ⠹ thinking…        1 file changed · 4 msgs · ctrl+c
```

## Launch paths

| How | Command | Backend |
|-----|---------|---------|
| From the root REPL flag | `todex --tui` (project root) | injected by the root package |
| Dev, root | `npm run dev -- --tui` (project root) | injected by the root package |
| Standalone dev | `npm run dev` (inside `cli/`) | dynamically imports root sources via tsx |
| Standalone built | `npm start` (inside `cli/`) | dynamically imports root `dist/` (requires `npm run build` at root) |

## Project structure

- `cli/src/index.tsx` — entry point; exports `startTui()` for the root launcher
- `cli/src/App.tsx` — full-screen layout
- `cli/src/components/` — `AgentOutput`, `TodoList`, `CommandBar`, `StatusBar`
- `cli/src/state/store.ts` — external store + agent-turn event sink; also
  tracks workspace, git branch/status, changed files and the active tool
- `cli/src/utils/toolDisplay.ts` — tool icons/colors and changed-file extraction
- `cli/src/utils/agent.ts` — backend loader (injection + dynamic fallback)
- `cli/src/types/types.ts` — shared TUI types

## How it integrates with the agent

The TUI never imports the agent's sources statically (they are CommonJS and
live outside this package's tsconfig). Instead:

1. The root package (`src/cli.ts` → `startTui()`) injects a **backend** object
   (`createCodingAgent`, `runAgentTurn`, `trimHistory`, tool manifest, model
   chain, `HumanMessage`) when launched via `todex --tui`.
2. `runAgentTurn` accepts an `AgentTurnEvents` sink; the TUI store implements
   it and routes streamed tokens, tool start/end events and TODO updates into
   React state — so no agent output ever scribbles over the TUI.
3. The agent's TODO list is read from `.agent-todos/*.todos.json` inside the
   working directory after every `write_todos` / `update_todos` tool call.

## Build

```bash
# from the project root (builds both packages):
npm run build

# or only the TUI:
cd cli && npm run build
```

## Notes

- `ink` is ESM-only (with top-level await in its graph), so this package is
  ESM (`"type": "module"`) and the root launcher loads it with a native
  dynamic `import()`.
- Slash commands (`/help`, `/tools`, `/model`, `/history`, `/clear`, `/exit`)
  work exactly like the original readline REPL, and keep working while the
  agent is mid-turn.
- The header reports the model chain, workspace path, git branch and dirty-file
  count. Tool lines carry per-tool icons; write/edit calls are collected into
  the panel's `changed` list.
- The original readline CLI remains the default (`todex`); this TUI is the
  alternate interface (`todex --tui`).
