import type { BaseMessage } from "@langchain/core/messages";

const MAX_HISTORY = 40;

export type AgentRunOptions = {
  recursionLimit?: number;
  timeout?: number;
  taskComplexity?: "simple" | "moderate" | "complex";
};

export type AgentEvents = {
  token?: (text: string) => void;
  toolStart?: (call: {
    name: string;
    input: unknown;
    callId?: string;
  }) => void;
  toolEnd?: (
    call: {
      name: string;
      input: unknown;
      callId?: string;
    },
    durationMs: number,
    failed: boolean,
    errorMessage?: string
  ) => void;
  todos?: (todos: unknown[]) => void;
};

export async function runAgentTurn(
  agent: any,
  messages: BaseMessage[],
  events: AgentEvents = {},
  options: AgentRunOptions = {}
): Promise<BaseMessage[]> {
  const recursionLimit = options.recursionLimit ?? 500;

  const timeout =
    options.timeout ??
    ({
      simple: 2 * 60 * 1000,
      moderate: 5 * 60 * 1000,
      complex: 15 * 60 * 1000,
    }[options.taskComplexity ?? "moderate"] ?? 5 * 60 * 1000);

  /*
   * IMPORTANT:
   * createAgent().streamEvents(v3) returns a Promise<AgentRunStream>.
   * We MUST await it before consuming run.messages / run.toolCalls.
   */
  const run = await agent.streamEvents(
    { messages },
    {
      version: "v3",
      recursionLimit,
    }
  );

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const execute = async (): Promise<BaseMessage[]> => {
    /*
     * Consume message stream for live model output.
     */
    const messageConsumer = (async () => {
      for await (const message of run.messages) {
        for await (const token of message.text) {
          if (token) {
            events.token?.(token);
          }
        }
      }
    })();

    /*
     * Consume tool calls separately.
     */
    const toolConsumer = (async () => {
      for await (const call of run.toolCalls) {
        const tool = {
          name: call.name,
          input: call.input,
          callId: call.id,
        };

        const startedAt = Date.now();

        events.toolStart?.(tool);

        try {
          const output = await call.output;

          events.toolEnd?.(
            tool,
            Date.now() - startedAt,
            false
          );

          void output;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          events.toolEnd?.(
            tool,
            Date.now() - startedAt,
            true,
            message
          );

          throw error;
        }
      }
    })();

    /*
     * Both streams need to be consumed.
     */
    await Promise.all([
      messageConsumer,
      toolConsumer,
    ]);

    /*
     * Final agent state.
     */
    const output = await run.output;

    if (Array.isArray(output?.messages)) {
      return output.messages as BaseMessage[];
    }

    return messages;
  };

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Agent execution timed out after ${Math.round(
            timeout / 1000
          )}s`
        )
      );
    }, timeout);
  });

  try {
    return await Promise.race([
      execute(),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function trimHistory(
  messages: BaseMessage[]
): BaseMessage[] {
  if (messages.length <= MAX_HISTORY) {
    return messages;
  }

  return messages.slice(-MAX_HISTORY);
}

export function renderToolManifest(): string {
  return [
    "Filesystem tools",
    "Shell tools",
    "Git tools",
    "AST analysis",
    "Import/dependency graph",
    "Codebase/RAG search",
    "Project memory",
    "TODO/workflow tools",
  ].join("\n");
}

export function describeModelChain(): string {
  return "Configured model + fallback chain";
}