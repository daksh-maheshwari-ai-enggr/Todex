import { tool, createAgent } from "langchain";
import { z } from "zod";
import { HumanMessage } from "@langchain/core/messages";
import {
  DEFAULT_SUBAGENT_PROMPT,
  getTaskToolDescription,
} from "../task/taskToolPrompt";

/**
 * The Task Tool: this is where ephemeral subagent spawning happens.
 *
 * A spawned subagent gets its own isolated agent context and the tools
 * supplied through config.tools. The parent agent only receives the
 * subagent's final streamed content.
 */
export const createTaskTool = (model: any, config: any = {}) => {
  return tool(
    async ({ sub_agent, task }, toolConfig: any) => {
      if (!task || !sub_agent) {
        return "Please provide sub_agent and task that will be executed.";
      }

      const subagent = createAgent({
        model,
        tools: [...(config.tools ?? [])],
        systemPrompt: `${DEFAULT_SUBAGENT_PROMPT}\n\nTask: ${task}`,
      });

      const subagentStream = await subagent.stream(
        {
          messages: [new HumanMessage(task)],
        },
        {
          streamMode: "messages",
          ...toolConfig,
        }
      );

      let finalContent = "";

      for await (const [chunk, metadata] of subagentStream as any) {
        if (chunk?.type !== "ai") continue;

        if (chunk.content) {
          toolConfig?.writer?.({
            subagent_name: sub_agent,
            content: chunk.content,
          });

          if (typeof chunk.content === "string") {
            finalContent += chunk.content;
          } else {
            finalContent += JSON.stringify(chunk.content);
          }
        }
      }

      return finalContent;
    },
    {
      name: "task",
      description: getTaskToolDescription(),
      schema: z.object({
        sub_agent: z
          .string()
          .describe(
            "The name must be unique for each spawned sub-agent, e.g. webscraper."
          ),
        task: z
          .string()
          .describe(
            "Highly detailed instructions for the sub-agent. Include context, constraints, and the exact expected output."
          ),
      }),
    }
  );
};
