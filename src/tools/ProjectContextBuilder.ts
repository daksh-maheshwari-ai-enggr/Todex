import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { WORKING_DIR } from "./fileSystem";

/**
 * Agent memory / directory structure
 *
 * .agent/
 * ├── index.md                 <- always loaded: project overview, stack, entry points
 * ├── modules/
 * │   ├── auth.md              <- module-specific knowledge
 * │   ├── api.md
 * │   ├── ui.md
 * │   └── ...
 * ├── graph.json               <- serialized import graph
 * └── embeddings.json          <- RAG embedding tracking
 */

const AGENT_DIR = path.join(WORKING_DIR, ".agent");
const INDEX_PATH = path.join(AGENT_DIR, "index.md");
const MODULES_DIR = path.join(AGENT_DIR, "modules");
const GRAPH_PATH = path.join(AGENT_DIR, "graph.json");
const EMBEDDINGS_PATH = path.join(AGENT_DIR, "embeddings.json");

const INDEX_TEMPLATE = `# Agent Memory — Index
> Auto-maintained. Loaded every session. Keep this concise — details go in modules/.
> Last updated: ${new Date().toISOString()}

## Project Overview
*Not yet analyzed*

## Tech Stack
*Not yet detected*

## Entry Points
*Not yet identified*

## Module Map
*Not yet mapped*

## Key Conventions
*Not yet observed*

## Known Issues
*None recorded*
`;

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function ensureAgentDir() {
  await fs.mkdir(MODULES_DIR, { recursive: true });

  try {
    await fs.access(INDEX_PATH);
  } catch {
    await fs.writeFile(INDEX_PATH, INDEX_TEMPLATE, "utf-8");
    console.log("[AgentMemory] Created .agent/index.md");
  }
}

function safeSectionReplace(
  content: string,
  section: string,
  newContent: string,
  append = false
): string {
  const regex = new RegExp(
    `^## ${escapeRegex(section)}\\n([\\s\\S]*?)(?=\\n## |$)`,
    "m"
  );

  const match = regex.exec(content);

  if (match) {
    if (append) {
      const existing = match[1].trim();

      const merged = existing
        ? `${existing}\n${newContent}`
        : newContent;

      return content.replace(
        regex,
        `## ${section}\n${merged}\n`
      );
    }

    return content.replace(
      regex,
      `## ${section}\n${newContent}\n`
    );
  }

  // Section doesn't exist — append it.
  return `${content.trimEnd()}\n\n## ${section}\n${newContent}\n`;
}

function touchTimestamp(content: string): string {
  return content.replace(
    /Last updated: .*/,
    `Last updated: ${new Date().toISOString()}`
  );
}

// --------------------------------------------------
// read_agent_index
// --------------------------------------------------

export const readAgentIndexTool = tool(
  async () => {
    await ensureAgentDir();

    const content = await fs.readFile(INDEX_PATH, "utf-8");

    let moduleList = "";

    try {
      const files = await fs.readdir(MODULES_DIR);
      const mds = files.filter((f) => f.endsWith(".md"));

      moduleList =
        mds.length > 0
          ? `\n\n---\n📦 Available module files (load with read_agent_module):\n${mds
              .map((f) => `- ${f.replace(".md", "")}`)
              .join("\n")}`
          : "\n\n---\n📦 No module files yet.";
    } catch {
      // modules directory may be empty
    }

    return `📄 .agent/index.md\n\n${content}${moduleList}`;
  },
  {
    name: "read_agent_index",
    description:
      "Read .agent/index.md — the agent's top-level project memory. " +
      "ALWAYS call this first at session start. " +
      "It contains project overview, tech stack, entry points, and the module map. " +
      "For module-specific details, use read_agent_module.",
    schema: z.object({}),
  }
);

// --------------------------------------------------
// update_agent_index
// --------------------------------------------------

export const updateAgentIndexTool = tool(
  async ({ section, content, append }) => {
    await ensureAgentDir();

    let current = await fs.readFile(INDEX_PATH, "utf-8");

    current = safeSectionReplace(
      current,
      section,
      content,
      append ?? false
    );

    current = touchTimestamp(current);

    await fs.writeFile(INDEX_PATH, current, "utf-8");

    return `✅ .agent/index.md → section "${section}" ${
      append ? "appended" : "updated"
    }`;
  },
  {
    name: "update_agent_index",
    description:
      "Update a section in .agent/index.md. Keep index.md high-level and concise. " +
      "Sections: 'Project Overview', 'Tech Stack', 'Entry Points', 'Module Map', " +
      "'Key Conventions', 'Known Issues'. " +
      "For module-specific details, use write_agent_module instead.",
    schema: z.object({
      section: z
        .string()
        .describe("Section heading without ##"),

      content: z
        .string()
        .describe("Markdown content for this section"),

      append: z
        .boolean()
        .optional()
        .describe("Append instead of replacing"),
    }),
  }
);

// --------------------------------------------------
// read_agent_module
// --------------------------------------------------

export const readAgentModuleTool = tool(
  async ({ module_name }) => {
    await ensureAgentDir();

    const filePath = path.join(
      MODULES_DIR,
      `${module_name}.md`
    );

    try {
      const content = await fs.readFile(filePath, "utf-8");

      return `📦 .agent/modules/${module_name}.md\n\n${content}`;
    } catch {
      return `⚠️ No module file for "${module_name}" yet. Use write_agent_module to create it.`;
    }
  },
  {
    name: "read_agent_module",
    description:
      "Read a module-specific memory file from .agent/modules/<name>.md. " +
      "Load this when your task touches a specific module (e.g. 'auth', 'api', 'ui', 'db'). " +
      "Check index.md Module Map to see what modules exist.",
    schema: z.object({
      module_name: z
        .string()
        .describe(
          "Module name without .md (e.g. 'auth', 'api', 'ui', 'database')"
        ),
    }),
  }
);

// --------------------------------------------------
// write_agent_module
// --------------------------------------------------

export const writeAgentModuleTool = tool(
  async ({ module_name, section, content, append }) => {
    await ensureAgentDir();

    const filePath = path.join(
      MODULES_DIR,
      `${module_name}.md`
    );

    let current: string;

    try {
      current = await fs.readFile(filePath, "utf-8");
    } catch {
      // Create fresh module file
      current = `# Module: ${module_name}
> Auto-maintained by the coding agent.
> Last updated: ${new Date().toISOString()}

## Overview
*Not yet analyzed*

## Key Files
*Not yet identified*

## Exports & API Surface
*Not yet documented*

## Patterns & Conventions
*Not yet observed*

## Dependencies
*Not yet mapped*

## Known Issues
*None recorded*
`;

      console.log(
        `[AgentMemory] Created .agent/modules/${module_name}.md`
      );
    }

    current = safeSectionReplace(
      current,
      section,
      content,
      append ?? false
    );

    current = touchTimestamp(current);

    await fs.writeFile(filePath, current, "utf-8");

    return `✅ .agent/modules/${module_name}.md → section "${section}" ${
      append ? "appended" : "updated"
    }`;
  },
  {
    name: "write_agent_module",
    description:
      "Write module-specific knowledge to .agent/modules/<name>.md. " +
      "Create one module file per logical domain of the project (auth, api, ui, database, etc.). " +
      "Sections: 'Overview', 'Key Files', 'Exports & API Surface', " +
      "'Patterns & Conventions', 'Dependencies', 'Known Issues'. " +
      "After creating a new module file, update index.md Module Map with update_agent_index.",
    schema: z.object({
      module_name: z
        .string()
        .describe("Module name (e.g. 'auth', 'api', 'ui', 'database')"),

      section: z
        .string()
        .describe("Section heading without ##"),

      content: z
        .string()
        .describe("Markdown content"),

      append: z
        .boolean()
        .optional()
        .describe("Append instead of replacing"),
    }),
  }
);

// --------------------------------------------------
// list_agent_modules
// --------------------------------------------------

export const listAgentModulesTool = tool(
  async () => {
    await ensureAgentDir();

    try {
      const files = await fs.readdir(MODULES_DIR);

      const mds = files.filter((f) => f.endsWith(".md"));

      if (!mds.length) {
        return "No module files yet in .agent/modules/";
      }

      const previews = await Promise.all(
        mds.map(async (f) => {
          const content = await fs.readFile(
            path.join(MODULES_DIR, f),
            "utf-8"
          );

          const overview =
            content.match(
              /## Overview\n([\s\S]*?)(?=\n##|$)/
            )?.[1]?.trim() ?? "no overview";

          return `📦 ${f.replace(".md", "")} — ${overview.slice(
            0,
            100
          )}`;
        })
      );

      return `Available modules (${mds.length}):\n${previews.join(
        "\n"
      )}`;
    } catch {
      return "No module files yet.";
    }
  },
  {
    name: "list_agent_modules",
    description:
      "List all module memory files in .agent/modules/ with a brief preview of each.",
    schema: z.object({}),
  }
);

// --------------------------------------------------
// read_embeddings_index
// --------------------------------------------------

export const readEmbeddingsIndexTool = tool(
  async () => {
    try {
      const raw = await fs.readFile(
        EMBEDDINGS_PATH,
        "utf-8"
      );

      const data = JSON.parse(raw);
      const entries = Object.entries(data);

      if (!entries.length) {
        return "No files have been embedded yet.";
      }

      const lines = entries.map(([file, info]: [string, any]) =>
        `${file} — embedded ${
          info?.embeddedAt
            ? new Date(info.embeddedAt).toLocaleDateString()
            : "unknown date"
        }, ${info?.chunkCount ?? 0} chunks`
      );

      return `📊 Embedded files (${entries.length}):\n${lines.join(
        "\n"
      )}`;
    } catch {
      return "No embeddings index yet. Run embed_codebase to start indexing.";
    }
  },
  {
    name: "read_embeddings_index",
    description:
      "Check which files have already been embedded into the RAG vector store. " +
      "Use this before embed_codebase to avoid re-embedding files unnecessarily.",
    schema: z.object({}),
  }
);

// --------------------------------------------------
// Record embedding metadata
// --------------------------------------------------

export async function recordEmbeddings(
  fileChunkMap: Record<string, number>
) {
  await ensureAgentDir();

  let existing: Record<string, any> = {};

  try {
    existing = JSON.parse(
      await fs.readFile(
        EMBEDDINGS_PATH,
        "utf-8"
      )
    );
  } catch {
    // First time
  }

  const now = new Date().toISOString();

  for (const [file, chunkCount] of Object.entries(
    fileChunkMap
  )) {
    existing[file] = {
      embeddedAt: now,
      chunkCount,
    };
  }

  await fs.writeFile(
    EMBEDDINGS_PATH,
    JSON.stringify(existing, null, 2),
    "utf-8"
  );
}

// --------------------------------------------------
// Export all memory tools
// --------------------------------------------------

export const agentMemoryTools = [
  readAgentIndexTool,
  updateAgentIndexTool,
  readAgentModuleTool,
  writeAgentModuleTool,
  listAgentModulesTool,
  readEmbeddingsIndexTool,
];