import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { WORKING_DIR, ensureWorkingDir } from "../workspace";

const execAsync = promisify(exec);

const MAX_OUTPUT_CHARS = 8000;

const isWindows = process.platform === "win32";

const SHELL = isWindows
  ? "cmd.exe"
  : "/bin/bash";

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/(?!\w)/,
  />\s*\/dev\//,
  /mkfs/,
  /dd\s+if=/,
  /sudo\s+rm/,
  /shutdown|reboot|halt/,
  /curl\s+.*\|\s*(?:bash|sh|zsh)/,
  /wget\s+.*\|\s*(?:bash|sh|zsh)/,
  /\beval\b/,
  /base64\s+.*\|\s*(?:bash|sh)/,
  /(?:^|[;&|])\s*\/(?:etc|home|root|usr|var|sys|proc)\b/
];

const INTERACTIVE_PATTERNS = [
  /\brd\s+\/s(?!\s+\/q)/i,
  /\bnpm\s+init\b(?!.*-y)/i,
  /\bapt(?:-get)?\s+install\b(?!.*-y)/i,
  /\bgit\s+commit\b(?!.*-m)/i,
  /\b(?:nano|vim|vi|emacs|less|more)\b/i,
  /\b(?:python3?|node)\b(?!\s+-[^\s]+)?/i,
  /\bssh\b/i,
];

function normalizeCommand(command: string): string {
  if (isWindows) {
    if (
      /^rd\s+\/s\s+/i.test(command) &&
      !/\/q/i.test(command)
    ) {
      return command.replace(
        /rd\s+\/s/i,
        "rd /s /q"
      );
    }
  } else {
    if (/npm\s+init(?!.*-y)/.test(command)) {
      return command + " -y";
    }

    if (
      /apt(?:-get)?\s+install(?!.*-y)/.test(command)
    ) {
      return command.replace(
        /install/,
        "install -y"
      );
    }
  }

  return command;
}

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) {
    return output;
  }

  const half = MAX_OUTPUT_CHARS / 2;

  return (
    output.slice(0, half) +
    `\n\n... [truncated ${
      output.length - MAX_OUTPUT_CHARS
    } chars] ...\n\n` +
    output.slice(-half)
  );
}

export const bashTool = tool(
  async ({ command, timeout }) => {
    ensureWorkingDir();

    // Block dangerous commands
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return `🚫 Blocked dangerous command: "${command}"`;
      }
    }

    // Check interactive commands
    for (const pattern of INTERACTIVE_PATTERNS) {
      if (pattern.test(command)) {
        const fixed = normalizeCommand(command);

        if (fixed !== command) {
          command = fixed;
        } else {
          return `⚠️ Interactive command detected (may hang): "${command}". Add non-interactive flags.`;
        }
      }
    }

    const start = Date.now();

    try {
      const { stdout, stderr } = await execAsync(
        command,
        {
          cwd: WORKING_DIR,

          timeout:
            Math.min(
              Math.max(timeout ?? 20, 5),
              120
            ) * 1000,

          maxBuffer: 1024 * 1024 * 2,

          shell: SHELL,
        }
      );

      const out: string[] = [];

      if (stdout?.trim()) {
        out.push(
          `STDOUT:\n${truncateOutput(
            stdout.trim()
          )}`
        );
      }

      if (stderr?.trim()) {
        out.push(
          `STDERR (may be normal verbose output):\n${truncateOutput(
            stderr.trim()
          )}`
        );
      }

      const result = out.length
        ? out.join("\n\n")
        : "✅ Command completed";

      return result;
    } catch (err: any) {
      if (
        err.killed ||
        err.signal === "SIGTERM"
      ) {
        return `⏱️ Command timed out: "${command}"`;
      }

      const sanitized = err.message.replace(
        new RegExp(
          WORKING_DIR.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          ),
          "g"
        ),
        "[WORKING_DIR]"
      );

      const msg: string[] = [sanitized];

      if (err.stdout) {
        msg.push(
          `STDOUT:\n${truncateOutput(
            err.stdout
          )}`
        );
      }

      if (err.stderr) {
        msg.push(
          `STDERR:\n${truncateOutput(
            err.stderr
          )}`
        );
      }

      return `❌ Command failed:\n${msg.join(
        "\n"
      )}`;
    }
  },
  {
    name: "bash",

    description:
      "Cross-platform shell tool (Windows/Linux). Runs in a sandboxed working directory. Auto-fixes common interactive commands. Use for npm, git, builds. Destructive or interactive commands are blocked.",

    schema: z.object({
      command: z
        .string()
        .min(1)
        .max(2000)
        .describe(
          "Shell command to execute"
        ),

      timeout: z
        .number()
        .min(5)
        .max(120)
        .optional()
        .describe(
          "Timeout in seconds (default: 20)"
        ),
    }),
  }
);
