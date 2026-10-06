import fs from 'fs/promises';
import path from 'path';

// Constants
const WORKING_DIR = process.env.WORKING_DIR || '/home/todo/Todex';
const AGENT_DIR = path.join(WORKING_DIR, '.agent');
const INDEX_PATH = path.join(AGENT_DIR, 'index.md');

// Populated content for the index.md
const INDEX_CONTENT = `# Agent Memory — Index
> Auto-maintained. Loaded every session. Keep this concise — details go in modules/.
> Last updated: ${new Date().toISOString()}

## Project Overview
Todex is an AI coding assistant that helps developers write, debug, and optimize code. It provides an interactive REPL with terminal UI, comprehensive tooling for code analysis, modification, and project management, and supports multi-provider LLM fallback (FreeLLMAPI, Groq, OpenRouter).

## Tech Stack
Todex is built with Node.js and TypeScript. Key dependencies include:
- LangChain for LLM integration
- Ink for terminal UI
- Babel for AST parsing
- Pinecone for semantic search
- Zod for schema validation
- simple-git for Git operations

## Entry Points
The main entry points for Todex are:
- 	odex (interactive REPL)
- 	odex "prompt" (one-shot mode)
- 	odex --tui (full-screen TUI interface)
- 	src/index.ts (main entry point for the CLI)
- 	src/agent.ts (core agent logic)

## Module Map
The main modules in Todex include:
- 	auth (authentication logic)
- 	api (API endpoints and routes)
- 	ui (user interface components)
- 	database (database interactions)
- 	utils (utility functions and helpers)

## Key Conventions
Key conventions in Todex include:
- Using LangChain for LLM integration and tool management
- Sandboxing filesystem, shell, and git operations in the working directory
- Following a structured agentic loop (ORIENT → PLAN → TODO → EXECUTE → VERIFY → REPAIR → COMPLETE)
- Using Zod for schema validation in tools
- Persisting agent memory across sessions in .agent/ and .agent-todos/ directories

## Known Issues
*None recorded*
`;

async function updateIndexFile() {
  try {
    // Ensure the agent directory exists
    await fs.mkdir(AGENT_DIR, { recursive: true });

    // Create the index.md file with populated content
    await fs.writeFile(INDEX_PATH, INDEX_CONTENT);

    console.log(`Successfully updated .agent/index.md`);
  } catch (error) {
    console.error(`Error updating .agent/index.md:`, error);
  }
}

// Run the function
updateIndexFile();