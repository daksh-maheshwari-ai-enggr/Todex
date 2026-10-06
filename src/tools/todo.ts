import fs from "fs";
import path from "path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { v4 as uuid, validate as isUUID } from "uuid";
import { WORKING_DIR } from "./fileSystem";
import { ensureMetadataDir } from "../workspace";

const BASE_DIR = path.join(WORKING_DIR, ".agent-todos");

const InputTaskSchema = z.object({
  task: z.string(),
  assigned_to: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "blocked"]).default("pending"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  parent_id: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
});

export const write_todos = tool(
  async ({ filename, todos }, toolConfig: any) => {
    try {
      ensureMetadataDir(BASE_DIR);
      const realFileName = `${filename}.todos.json`;
      const filePath = path.join(BASE_DIR, realFileName);
      const now = new Date().toISOString();

      const enriched = todos.map((t: any) => ({
        id: uuid(),
        task: t.task,
        assigned_to: t.assigned_to,
        status: t.status ?? "pending",
        parent_id: t.parent_id,
        dependencies: t.dependencies ?? [],
        created_at: now,
        updated_at: now,
      }));

      const jsonStringTodos = JSON.stringify(enriched, null, 2);
      await fs.promises.writeFile(filePath, jsonStringTodos, "utf8");

      toolConfig?.writer?.({
        todos: "todos",
        todoList: jsonStringTodos,
      });

      return `<think>${JSON.stringify({
        message: `✅ TODO list saved. File name: ${realFileName}`,
        tasks: enriched,
      }, null, 2)}</think>`;
    } catch (error: any) {
      return `❌ Error writing TODO list: ${error.message}`;
    }
  },
  {
    name: "write_todos",
    description: `Creates or overwrites a workflow TODO list.

The Manager agent normally uses this at the start of a workflow before
delegating tasks to subagents. Every task gets a unique UUID and timestamps.
Status defaults to pending and dependencies default to an empty array.

The filename may contain folders. Missing folders are created automatically.
The .todos.json extension is appended automatically.

Examples:
- research-plan
- projects/ai-agent/research-plan
- tasks/frontend/ui-workflow`,
    schema: z.object({
      filename: z.string().describe(
        "Name of the TODO file. A simple filename or folder/filename path may be provided. The tool appends .todos.json."
      ),
      todos: z.array(InputTaskSchema),
    }),
  }
);

export const read_todos = tool(
  async ({ filename }) => {
    try {
      const filePath = path.join(BASE_DIR, filename);

      if (!fs.existsSync(filePath)) {
        return "No TODO list found.";
      }

      const raw = await fs.promises.readFile(filePath, "utf8");
      const todos = JSON.parse(raw);

      return `<think>${JSON.stringify(todos, null, 2)}</think>`;
    } catch (error: any) {
      return `❌ Error reading TODO list: ${error.message}`;
    }
  },
  {
    name: "read_todos",
    description: "Read a workflow TODO list.",
    schema: z.object({
      filename: z.string().describe("Filename containing todolist"),
    }),
  }
);

export const update_todos = tool(
  async ({ filename, updates }, toolConfig: any) => {
    try {
      const invalidIds = updates.filter((u: any) => !isUUID(u.id));

      if (invalidIds.length > 0) {
        return "⚠️ Invalid task IDs detected. Please try again with valid UUIDs.";
      }

      const filePath = path.join(BASE_DIR, filename);

      if (!fs.existsSync(filePath)) {
        return "No TODO list found.";
      }

      const raw = await fs.promises.readFile(filePath, "utf8");
      const todos = JSON.parse(raw);

      // Index IDs once instead of calling findIndex for every update.
      const indexById = new Map<string, number>();
      todos.forEach((task: any, index: number) => {
        indexById.set(task.id, index);
      });

      const now = new Date().toISOString();

      for (const update of updates) {
        const index = indexById.get(update.id);
        if (index === undefined) continue;

        todos[index] = {
          ...todos[index],
          ...update,
          updated_at: now,
        };
      }

      await fs.promises.writeFile(
        filePath,
        JSON.stringify(todos, null, 2),
        "utf8"
      );

      toolConfig?.writer?.({
        update_todos: "update_todos",
        updates,
      });

      return "✅ TODO list updated successfully.";
    } catch (error: any) {
      return `❌ Error updating TODO list: ${error.message}`;
    }
  },
  {
    name: "update_todos",
    description: `Updates workflow TODO tasks by UUID.

Use it to change a task's status, reassign a task, or modify its description.
Only supplied fields are changed. updated_at is automatically refreshed.
Dependencies are read-only in this tool.

Important:
1. Update tasks strictly by UUID.
2. Never identify tasks by name or array index.
3. Fetch/read the latest TODO list before updating.
4. Never guess UUIDs.`,
    schema: z.object({
      filename: z.string(),
      updates: z.array(
        z.object({
          id: z.string(),
          task: z.string().optional(),
          assigned_to: z.string().optional(),
          status: z.enum(["pending", "in_progress", "completed", "blocked"]).optional(),
        })
      ),
    }),
  }
);

export const get_next_runnable_tasks = tool(
  async ({ filename }) => {
    try {
      const filePath = path.join(BASE_DIR, filename);

      if (!fs.existsSync(filePath)) {
        return "No todolist found.";
      }

      const raw = await fs.promises.readFile(filePath, "utf8");
      const todos = JSON.parse(raw);

      if (!Array.isArray(todos)) {
        return "❌ Invalid TODO list format.";
      }

      /*
       * Build indexes once.
       *
       * Previous style:
       *   todos.find(...) for every dependency
       *
       * This version uses Map/Set for O(1) average lookups.
       */
      const taskById = new Map<string, any>();
      const keyToId = new Map<string, string>();
      const completedIds = new Set<string>();

      for (const task of todos) {
        if (task?.id) taskById.set(task.id, task);
        if (task?.key && task?.id) keyToId.set(task.key, task.id);
        if (task?.status === "completed" && task?.id) {
          completedIds.add(task.id);
        }
      }

      const runnable = todos.filter((task: any) => {
        if (task?.status !== "pending") return false;

        const dependencies = Array.isArray(task?.dependencies)
          ? task.dependencies
          : [];

        if (dependencies.length === 0) return true;

        return dependencies.every((dependency: string) => {
          // Resolve temporary task key -> real UUID.
          const dependencyId = keyToId.get(dependency) ?? dependency;

          // Preserve the original behavior:
          // a missing dependency is considered satisfied.
          if (!taskById.has(dependencyId)) return true;

          return completedIds.has(dependencyId);
        });
      });

      // Sort runnable tasks by priority (highest priority first)
      runnable.sort((a: any, b: any) => {
        const priorityOrder: Record<string, number> = {
          low: 1,
          medium: 2,
          high: 3,
          critical: 4,
        };
        return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
      });

      return `<think>${JSON.stringify(runnable, null, 2)}</think>`;
    } catch (error: any) {
      return `❌ Error finding runnable tasks: ${error.message}`;
    }
  },
  {
    name: "get_next_runnable_tasks",
    description: `Returns all currently runnable tasks from a workflow TODO list.

A task is runnable when:
- its status is pending
- every dependency is completed
- dependencies may be UUIDs or temporary task keys
- missing dependencies are treated as satisfied

The returned tasks include their complete objects and IDs so the Manager
agent can execute them and later call update_todos.`,
    schema: z.object({
      filename: z.string().describe("Filename containing the workflow TODO list"),
    }),
  }
);
