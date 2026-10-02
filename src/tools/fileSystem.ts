import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { glob } from "glob";
import { WORKING_DIR, ensureWorkingDir } from "../workspace";

// Re-export from the unified workspace module so all existing importers
// (todos, import graph, agent memory, RAG) share one source of truth.
export { WORKING_DIR };

ensureWorkingDir();

// Directories to always exclude from file operations
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".cache",
  "__pycache__",
  ".turbo",
  "out",
]);

/**
 * Resolve a relative path safely - prevents path traversal attacks.
 */
export function safePath(filePath: string) {
  const resolved = path.resolve(WORKING_DIR, filePath);

  if (!resolved.startsWith(WORKING_DIR + path.sep) && resolved !== WORKING_DIR) {
    throw new Error(`🚫 Path traversal blocked: ${filePath}`);
  }

  return resolved;
}

// -----------------------------------------------------------------------------
// read_file
// -----------------------------------------------------------------------------

export const readFileTool = tool(
  async ({ file_path, start_line, end_line }) => {
    try {
      const fullPath = safePath(file_path);
      const raw = await fs.readFile(fullPath, "utf-8");
      const lines = raw.split("\n");

      const from = start_line ? start_line - 1 : 0;
      const to = end_line ? end_line : lines.length;
      const slice = lines.slice(from, to);

      const numbered = slice
        .map((line, i) => `${from + i + 1}|${line}`)
        .join("\n");

      const rangeInfo =
        start_line || end_line ? ` (lines ${from + 1}-${to})` : "";

      return `📄 ${file_path}${rangeInfo}\n\`\`\`\n${numbered}\n\`\`\``;
    } catch (err: any) {
      return `Error reading file: ${err.message}`;
    }
  },
  {
    name: "read_file",
    description:
      "Read the contents of a file with line numbers. Optionally read a specific line range.",
    schema: z.object({
      file_path: z
        .string()
        .describe("Path relative to the working directory"),
      start_line: z
        .number()
        .optional()
        .describe(
          "First line to read (1-indexed). Omit to read from the beginning."
        ),
      end_line: z
        .number()
        .optional()
        .describe(
          "Last line to read (inclusive). Omit to read through the end."
        ),
    }),
  }
);

// -----------------------------------------------------------------------------
// write_file
// -----------------------------------------------------------------------------

export const writeFileTool = tool(
  async ({ file_path, content }) => {
    try {
      const fullPath = safePath(file_path);

      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, "utf-8");

      const lineCount = content.split("\n").length;

      return `✅ Written: ${file_path} (${lineCount} lines)`;
    } catch (err: any) {
      return `Error writing file: ${err.message}`;
    }
  },
  {
    name: "write_file",
    description:
      "Create a new file or fully overwrite an existing one. For targeted edits to existing files, use edit_file instead.",
    schema: z.object({
      file_path: z
        .string()
        .describe("Path relative to the working directory"),
      content: z.string().describe("Full file content to write"),
    }),
  }
);

// -----------------------------------------------------------------------------
// edit_file (str_replace approach like Claude Code)
// -----------------------------------------------------------------------------

export const editFileTool = tool(
  async ({ file_path, old_str, new_str }) => {
    try {
      const fullPath = safePath(file_path);
      const content = await fs.readFile(fullPath, "utf-8");

      const occurrences = content.split(old_str).length - 1;

      if (occurrences === 0) {
        return `❌ old_str not found in ${file_path}. Check that it matches the file exactly.`;
      }

      if (occurrences > 1) {
        return `❌ old_str found ${occurrences} times in ${file_path}. It must be unique — include more surrounding context.`;
      }

      const updated = content.replace(old_str, new_str);
      await fs.writeFile(fullPath, updated, "utf-8");

      const removed = old_str.split("\n").length;
      const added = new_str.split("\n").length;

      return `✅ Edited: ${file_path} (-${removed} lines / +${added} lines)`;
    } catch (err: any) {
      return `Error editing file: ${err.message}`;
    }
  },
  {
    name: "edit_file",
    description:
      "Surgically edit a file by replacing a unique string (old_str) with new content (new_str). old_str must appear exactly once — include enough surrounding context to make it unique. Always read_file before editing so you have the exact content.",
    schema: z.object({
      file_path: z
        .string()
        .describe("Path relative to the working directory"),
      old_str: z
        .string()
        .describe(
          "The exact string to replace (must be unique in the file)"
        ),
      new_str: z.string().describe("The replacement string"),
    }),
  }
);

// -----------------------------------------------------------------------------
// file_tree
// -----------------------------------------------------------------------------

async function buildTree(dirPath: string, prefix = ""): Promise<string> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  const visibleEntries = entries
    .filter((entry) => !IGNORE_DIRS.has(entry.name))
    .sort((a, b) => {
      // Directories first, then files; alphabetically within each group.
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });

  const lines: string[] = [];

  for (let i = 0; i < visibleEntries.length; i++) {
    const entry = visibleEntries[i];
    const isLast = i === visibleEntries.length - 1;

    const connector = isLast ? "└── " : "├── ";
    const nextPrefix = prefix + (isLast ? "    " : "│   ");

    if (entry.isDirectory()) {
      lines.push(`${prefix}${connector}${entry.name}/`);

      const childTree = await buildTree(
        path.join(dirPath, entry.name),
        nextPrefix
      );

      if (childTree) {
        lines.push(childTree);
      }
    } else {
      lines.push(`${prefix}${connector}${entry.name}`);
    }
  }

  return lines.join("\n");
}

export const fileTreeTool = tool(
  async ({ directory }) => {
    try {
      const targetDir = directory ? safePath(directory) : WORKING_DIR;
      const label = directory || ".";
      const tree = await buildTree(targetDir);

      return `📁 ${label}\n${tree || "(empty)"}`;
    } catch (err: any) {
      return `Error building file tree: ${err.message}`;
    }
  },
  {
    name: "file_tree",
    description:
      "Get a full recursive file tree of the project. Excludes node_modules, .git, dist, build and other generated/cache directories. Use this at the start of every session to understand the project layout.",
    schema: z.object({
      directory: z
        .string()
        .optional()
        .describe(
          "Subdirectory to tree (relative to working directory)"
        ),
    }),
  }
);

// -----------------------------------------------------------------------------
// list_dir
// -----------------------------------------------------------------------------

export const lsTool = tool(
  async ({ directory }) => {
    try {
      const fullPath = directory ? safePath(directory) : WORKING_DIR;

      const entries = await fs.readdir(fullPath, {
        withFileTypes: true,
      });

      const visibleEntries = entries
        .filter((entry) => !IGNORE_DIRS.has(entry.name))
        .sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) {
            return a.isDirectory() ? -1 : 1;
          }

          return a.name.localeCompare(b.name);
        });

      const lines = visibleEntries.map((entry) => {
        const type = entry.isDirectory() ? "[dir]" : "[file]";
        return `${type} ${entry.name}`;
      });

      return `Contents of ${directory || "."}:\n${
        lines.length ? lines.join("\n") : "(empty)"
      }`;
    } catch (err: any) {
      return `Error listing directory: ${err.message}`;
    }
  },
  {
    name: "list_dir",
    description:
      "List the immediate contents of a directory. Shows whether each entry is a file or directory.",
    schema: z.object({
      directory: z
        .string()
        .optional()
        .describe(
          "Directory path relative to the working directory. Omit to list the working directory."
        ),
    }),
  }
);

// -----------------------------------------------------------------------------
// search_file (grep-style cross-file search)
// -----------------------------------------------------------------------------

export const searchFileTool = tool(
  async ({ query, file_pattern, case_sensitive }) => {
    try {
      const files = await glob(
        file_pattern || "**/*.{js,ts,jsx,tsx}",
        {
          cwd: WORKING_DIR,
          ignore: [
            "**/node_modules/**",
            "**/.git/**",
            "**/dist/**",
            "**/build/**",
          ],
          nodir: true,
        }
      );

      const flags = case_sensitive ? "g" : "gi";
      const regex = new RegExp(query, flags);
      const results: string[] = [];

      for (const file of files) {
        const fullPath = path.join(WORKING_DIR, file);
        const content = await fs.readFile(fullPath, "utf-8");
        const lines = content.split("\n");
        const matches: string[] = [];

        lines.forEach((line, i) => {
          regex.lastIndex = 0;

          if (regex.test(line)) {
            matches.push(`${i + 1}: ${line.trim()}`);
          }
        });

        if (matches.length > 0) {
          results.push(
            `📄 ${file} (${matches.length} match${
              matches.length > 1 ? "es" : ""
            }):\n${matches.join("\n")}`
          );
        }
      }

      if (results.length === 0) {
        return `No matches found for "${query}"`;
      }

      return `"${query}" — ${results.length} file(s):\n\n${results.join(
        "\n\n"
      )}`;
    } catch (err: any) {
      return `Error searching files: ${err.message}`;
    }
  },
  {
    name: "search_file",
    description:
      "Search for a string or regex pattern across files (like grep). Returns matching lines with file names and line numbers.",
    schema: z.object({
      query: z.string().describe("String or regex pattern to search for"),
      file_pattern: z
        .string()
        .optional()
        .describe("Glob to limit files, e.g. '**/*.ts'"),
      case_sensitive: z
        .boolean()
        .optional()
        .describe("Case-sensitive match (default: false)"),
    }),
  }
);

// -----------------------------------------------------------------------------
// Export all filesystem tools
// -----------------------------------------------------------------------------

export const filesystemTools = [
  readFileTool,
  writeFileTool,
  editFileTool,
  fileTreeTool,
  lsTool,
  searchFileTool,
];
