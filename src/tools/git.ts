import { tool } from "@langchain/core/tools";
import { z } from "zod";
import simpleGit from "simple-git";
import path from "path";

const GIT_REPO = "human-in-loop";

const WORKING_DIR = path.resolve(
  process.cwd(),
  "public/working-dir/",
  GIT_REPO
);

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
