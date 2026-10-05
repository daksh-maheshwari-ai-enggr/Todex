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

## Usage

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

### Available Commands

| Command | Description |
|---------|-------------|
| `/help` | Show this help
| `/tools` | List every registered tool
| `/model` | Show the configured model fallback chain
| `/history` | Show how many messages are in context
| `/clear` | Forget the conversation so far
| `/exit`, `/quit` | Leave the CLI

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

The default working directory is `public/working-dir`. You can override it by setting the `AGENT_WORKING_DIR` environment variable.

## Development

To run in development mode:
```bash
npm run dev
```

## License

MIT