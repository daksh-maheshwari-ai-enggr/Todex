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