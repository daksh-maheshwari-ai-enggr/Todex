# Toodex - AI Coding Assistant

A powerful AI coding assistant that helps you write, debug, and optimize code.

## Features

- Interactive REPL with terminal UI
- Comprehensive tooling for code analysis, modification, and project management
- FreeLLMAPI-backed model provider (registry extensible to more later)
- AST-aware RAG for semantic code search
- Project memory management
- Workflow TODO planning and scheduling

## Installation

### Using cURL (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/daksh-maheshwari-ai-enggr/Todex/master/install.sh | bash
```

### Manual Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/todex.git
   cd todex
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Link the package globally:
   ```bash
   npm link
   ```

Once linked, `todex` is on your `PATH` and can be run from any directory.

## Usage

Run `todex` from inside the project you want to work on:

```bash
cd ~/code/my-project
todex            # interactive REPL, edits ./my-project
todex --tui      # full-screen TUI, edits ./my-project
todex "write a function to calculate the Fibonacci sequence"   # one-shot
```

The agent reads and writes files in the **current directory** by default. Override
the target with `--dir <path>` (or the `AGENT_WORKING_DIR` env var). On the first
run against a real project, todex asks for confirmation once per project; pass
`--yes` to skip the prompt in scripts.

### One-Shot Mode
Run a single command:
```bash
todex "write a function to calculate Fibonacci sequence"
```

### Interactive REPL
Start the interactive REPL:
```bash
todex
```

### Full-screen TUI
```bash
todex --tui
```

### Available Commands

| Command | Description |
|---------|-------------|
| `/help` | Show this help
| `/tools` | List every registered tool
| `/model` | Show the configured model fallback chain
| `/history` | Show how many messages are in context
| `/clear` | Forget the conversation so far
| `/exit`, `/quit` | Leave the CLI

### TUI keys

| Key | Action |
|-----|--------|
| `PgUp` / `PgDn` | Scroll the transcript (works while the agent streams) |
| `Shift+↑` / `Shift+↓` | Scroll one line |
| `Esc` | Jump back to the latest output |
| `↑` / `↓` | Walk prompt history |
| `Enter` | Send the prompt |

Pasting multi-line text fills the input without sending it — review, then press
`Enter` to run it.

### CLI flags

| Flag | Description |
|------|-------------|
| `--tui` | Start the full-screen (Ink) interface |
| `--dir <path>` | Work against a different directory |
| `--yes`, `-y` | Skip the first-run project confirmation |
| `--version`, `-v` | Print the version |
| `--help`, `-h` | Show usage |

## Configuration

### First-run setup

On first launch, if no FreeLLMAPI API key is configured, Todex shows an Ink
setup screen and asks for your key once. It is saved globally — you never need
to create a project `.env`:

```
~/.config/todex/config.json   # written with 0600 permissions
```

```json
{ "provider": "freellmapi", "apiKey": "..." }
```

Entering the key is enough to continue straight into the TUI.

### Environment overrides (optional, for development)

Environment variables still win over the stored config, so you can override
credentials without editing the global file:

```env
FREELLMAPI_API_KEY=your-api-key
FREELLMAPI_BASE_URL=http://localhost:3001/v1
FREELLMAPI_MODEL=auto
```

Any `.env` in the working directory or package root is loaded automatically and
is optional.

### Working Directory

By default the agent operates on the directory `todex` is launched from, so
`cd myproject && todex` edits `myproject` directly. Override it with
`--dir <path>` or the `AGENT_WORKING_DIR` environment variable (absolute, or
relative to the current directory).

Agent metadata (`.agent/`, `.agent-todos/`) is written inside the target
directory. Each such folder contains a `.gitignore` with `*` so your project's
`git status` stays clean.

## Development

To run in development mode:
```bash
npm run dev
```

## License

MIT