// server/lib/runner.ts
// Entry point — called by agent.post.ts to run the full agent.
// Wires together the LLM, tools, and graph then invokes it.

import { createLlm } from './llm'
import { buildGraph } from './nodes'
import type { AgentStep, McpTool, ProviderName, AgentState } from '../../types/agent'

export async function runTaskRunner(
  goal: string,
  provider: ProviderName,
  apiKey: string,
  tools: McpTool[],
  onStep: (step: AgentStep) => void,
): Promise<string> {
  console.log(`[runner] goal: "${goal}" | provider: ${provider}`)

  const llm   = createLlm(provider, apiKey)
  const graph = buildGraph(llm, tools, onStep)

    const initialState: AgentState = {
        goal,
        summary: '',
        plan: [],
        stepResults: [],
        finalAnswer: null,
    }

    // only cast HERE (at the boundary)
    const result = await graph.invoke(initialState as any)

  return result.finalAnswer ?? 'Could not produce a final answer.'
}
