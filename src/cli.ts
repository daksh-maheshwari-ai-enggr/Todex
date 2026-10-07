#!/usr/bin/env node

// Imported first so `--dir` is applied before workspace.ts
// (imported below via ./cli and ./agent) computes its module-level
// WORKING_DIR constant.
import "./bootstrap";

import { HumanMessage } from "@langchain/core/messages";
import { createCodingAgent } from "./agent";
import { confirmWorkspace } from "./trust";

const VERSION = process.env.VERSION || "1.0.0";

/* ---------------------------------------------------------------------------
 * Flag parsing — flags are consumed here so whatever remains is the prompt.
 * --------------------------------------------------------------------------- */

const HELP_TEXT = `Toodex CLI v${VERSION}

Usage:
  todex                      Interactive REPL (original terminal interface)
  todex "do something"       One-shot request
  todex --tui                Full-screen TUI (Ink) interface
  todex --dir <path> ...     Run against a different working directory

Options:
  --tui                      Start the alternate full-screen TUI
  --dir <path>               Override AGENT_WORKING_DIR
  --yes, -y                  Skip the first-run project confirmation
  --version                  Print the version
  --help                     Show this help

By default, todex reads and writes files in the directory it is launched from.

REPL commands:
  /help            Show this help
  /tools           List every registered tool
  /model           Show the configured model fallback chain
  /history         Show how many messages in context
  /clear           Forget the conversation so far
  /todo            List, filter, or prioritize TODO tasks
  /exit, /quit     Leave the CLI

TODO Commands:
  /todo list       List all tasks
  /todo filter <status>  Filter tasks by status (pending/in_progress/completed/blocked)
  /todo prioritize <priority>  Filter tasks by priority (low/medium/high/critical)

Anything else is sent to the agent as a request.`;