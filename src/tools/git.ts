import { tool } from "@langchain/core/tools";
import { z } from "zod";
import simpleGit from "simple-git";
import { WORKING_DIR } from "../workspace";

function getGit() {
  return simpleGit(WORKING_DIR);
}

async function assertGitRepo(git: any) {
  const isRepo = await git.checkIsRepo().catch(() => false);

  if (!isRepo) {
    throw new Error("Not a git repository. Run `git init` first.");
  }
}

// git-diff tool

export const gitDiffTool = tool(
  async ({ target, staged, file_path }) => {
    try {
      const git = getGit();

      await assertGitRepo(git);

      const args: string[] = [];

      if (staged) {
        args.push("--staged");
      } else if (target) {
        args.push(target);
      } else {
        args.push("HEAD");
      }

      if (file_path) {
        args.push("--", file_path);
      }

      const diff = await git.diff(args);

      if (!diff.trim()) {
        return "No changes detected";
      }

      return `\`\`\`diff\n${diff}\n\`\`\``;
    } catch (err: any) {
      return `Git diff error: ${err.message}`;
    }
  },
  {
    name: "git_diff",

    description:
      "Show git diff for the project. Use this at the start of a session to understand what changed. Can target a specific commit/branch, show only staged changes, or diff a single file.",

    schema: z.object({
      target: z
        .string()
        .optional()
        .describe("Commit or branch to diff against (e.g. 'main')"),

      staged: z
        .boolean()
        .optional()
        .describe("Show only staged (index) changes"),

      file_path: z
        .string()
        .optional()
        .describe("Limit diff to a specific file path"),
    }),
  }
);

// git-log tool

export const gitLogTool = tool(
  async ({ limit, author, since }) => {
    try {
      const git = getGit();

      await assertGitRepo(git);

      const options: any = {
        maxCount: limit ?? 10,
      };

      if (author) {
        options["--author"] = author;
      }

      if (since) {
        options["--since"] = since;
      }

      const log = await git.log(options);

      if (!log.all.length) {
        return "No commits found";
      }

      const lines = log.all.map((c) => {
        return `${c.hash.slice(0, 7)} | ${c.date.slice(
          0,
          10
        )} | ${c.author_name.padEnd(20)} | ${c.message}`;
      });

      return `Recent commits (${log.all.length}):\n\n${lines.join("\n")}`;
    } catch (err: any) {
      return `Git log error: ${err.message}`;
    }
  },
  {
    name: "git_log",

    description:
      "Show recent git commit history with hash, date, author, and message.",

    schema: z.object({
      limit: z
        .number()
        .optional()
        .describe("Number of commits to show (default: 10)"),

      author: z
        .string()
        .optional()
        .describe("Filter by author name or email"),

      since: z
        .string()
        .optional()
        .describe(
          "Show commits since this date (e.g. '2024-01-01')"
        ),
    }),
  }
);


// git-status tool

export const gitStatusTool = tool(
  async () => {
    try {
      const git = getGit();

      await assertGitRepo(git);

      const status = await git.status();

      const lines: string[] = [];

      if (status.staged.length) {
        lines.push(`Staged: ${status.staged.join(", ")}`);
      }

      if (status.modified.length) {
        lines.push(`Modified: ${status.modified.join(", ")}`);
      }

      if (status.not_added.length) {
        lines.push(`Untracked: ${status.not_added.join(", ")}`);
      }

      if (status.deleted.length) {
        lines.push(`Deleted: ${status.deleted.join(", ")}`);
      }

      if (status.conflicted.length) {
        lines.push(`Conflicts: ${status.conflicted.join(", ")}`);
      }

      if (!lines.length) {
        return "Working tree clean — nothing to commit";
      }

      return `Branch: ${status.current}\n\n${lines.join("\n")}`;
    } catch (err: any) {
      return `Git status error: ${err.message}`;
    }
  },
  {
    name: "git_status",

    description:
      "Show the current git status: staged, modified, untracked, and deleted files.",

    schema: z.object({}),
  }
);


export const gitTools = [
  gitDiffTool,
  gitLogTool,
  gitStatusTool,
];

