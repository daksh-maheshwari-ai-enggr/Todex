export const DEFAULT_SUBAGENT_PROMPT = `
In order to complete the objective that the user asks of you,
you have access to a number of standard tools.
`;

export function getTaskToolDescription() {
  return `
Launch an ephemeral subagent to handle complex, multi-step tasks in an isolated context window.

## Subagent Capabilities

All subagents have access to:
- Filesystem tools: write_file, read_file, edit_file, ls, grep
- Todo tools: read_todos, update_todos, write_todos

## When To Use

✅ USE for: multi-step research, large analysis, content generation, tasks that can run in parallel
❌ SKIP for: simple single tool calls — just do it directly

## Core Rules

1. **Parallelize aggressively** — launch multiple subagents in one message whenever tasks are independent
2. **Be explicit** — subagents are stateless and blind to conversation history. Your prompt IS their entire world
3. **Specify the output** — tell the agent exactly what to return. Its final message is all you get back
4. **Summarize to user** — the subagent result is invisible to the user. You must relay it in a follow-up message
5. **Trust the output** — subagent results are reliable

## Prompt Template (use this when spawning)

\`\`\`
Task: <what to do>
Context: <everything the agent needs to know>
Constraints: <limits, format, scope>
Return: <exactly what to include in the final message>
\`\`\`

## Examples

**Parallel research** (3 agents at once):
> "Research LeBron, Jordan, and Kobe" → spawn 3 agents simultaneously, synthesize results

**Isolated analysis** (1 agent, heavy context):
> "Analyze this repo for vulnerabilities" → spawn 1 agent, receive clean report without polluting main context

**Sequential with dependency** (agent A feeds agent B):
> Agent A returns analysis → use result to prompt Agent B for implementation

## Subagent Types

Specify \`subagent_type\` in every call:
- **general-purpose** — all tasks not covered by a specialist
`.trim();
}
