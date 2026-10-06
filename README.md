# Toodex - AI Coding Assistant

A powerful AI coding assistant that helps you write, debug, and optimize code.

## Features

- Interactive REPL with terminal UI
- Comprehensive tooling for code analysis, modification, and project management
- Multi-provider LLM fallback chain (FreeLLMAPI, Groq, OpenRouter)
- AST-aware RAG for semantic code search
- Project memory management
- Workflow TODO planning and scheduling

## Installation

### Using cURL (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/yourusername/todex/main/install.sh | bash
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

### CLI flags

| Flag | Description |
|------|-------------|
| `--tui` | Start the full-screen (Ink) interface |
| `--dir <path>` | Work against a different directory |
| `--yes`, `-y` | Skip the first-run project confirmation |
| `--version`, `-v` | Print the version |
| `--help`, `-h` | Show usage |

## Configuration

### Environment Variables

Create a `.env` file in the project root with your API keys:
```env
FREELLMAPI_API_KEY=your-api-key
FREELLMAPI_BASE_URL=http://localhost:3001/v1
GROQ_API_KEY=your-groq-key
OPENROUTER_API_KEY=your-openrouter-key
COHERE_API_KEY=your-cohere-key
PINECONE_API_KEY=your-pinecone-key
```

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