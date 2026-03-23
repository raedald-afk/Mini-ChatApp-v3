// server/lib/nodes.ts
// Contains the 4 LangGraph nodes and builds the compiled graph.
// Each node has one job and passes its result to the next via shared state.
//
// Flow: summarizer → planCreator → executor → responder → END

import { StateGraph, Annotation, END } from '@langchain/langgraph'
import type { AgentStep, McpTool } from '../../types/agent'
import {
  callLlm, safeParseJson,
  summarizerPrompt, planCreatorPrompt, executorPrompt, responderPrompt,
  type LlmInstance,
} from './llm'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── STATE SCHEMA ──────────────────────────────────────────────────────────

export const GraphState = Annotation.Root({
    goal: Annotation<string>({ value: (_, b) => b, default: () => '' }),
    summary: Annotation<string>({ value: (_, b) => b, default: () => '' }),
    plan: Annotation<string[]>({ value: (_, b) => b, default: () => [] }),
    stepResults: Annotation<AgentStep[]>({ value: (_, b) => b, default: () => [] }),
    finalAnswer: Annotation<string | null>({ value: (_, b) => b, default: () => null }),
})

export type State = typeof GraphState.State

// ── BUILD GRAPH ───────────────────────────────────────────────────────────

export function buildGraph(
  llm: LlmInstance,
  tools: McpTool[],
  onStep: (step: AgentStep) => void,
) {
  const toolMap  = new Map(tools.map(t => [t.name, t]))
  const toolList = tools.map(t => `  - ${t.name}: ${t.description}`).join('\n')

  // ── NODE 1: summarizer ────────────────────────────────────────────────
  // Rewrites the raw user goal as one clear, precise sentence.
  async function summarizerNode(state: State): Promise<Partial<State>> {
    await sleep(300)
    const summary = await callLlm(llm, summarizerPrompt(), `Goal: ${state.goal}`)
    const clean   = summary.trim()

    onStep({ thought: `Understood: ${clean}`, tool: null, toolInput: null, toolOutput: null })
    console.log('[summarizer]', clean)
    return { summary: clean }
  }

  // ── NODE 2: planCreator ───────────────────────────────────────────────
  // Breaks the summary into up to 4 concrete steps.
  async function planCreatorNode(state: State): Promise<Partial<State>> {
    await sleep(300)
    const raw  = await callLlm(llm, planCreatorPrompt(toolList), `Goal: ${state.summary}`)
    const plan = safeParseJson<string[]>(raw)

    onStep({ thought: `Plan ready: ${plan.length} steps`, tool: null, toolInput: null, toolOutput: null })
    console.log('[planCreator]', plan)
    return { plan }
  }

  // ── NODE 3: executor ──────────────────────────────────────────────────
  // Runs each step one by one using the right MCP tool.
  async function executorNode(state: State): Promise<Partial<State>> {
    const results: AgentStep[] = []
    const calledTools = new Set<string>()

    for (const stepDescription of state.plan) {
      await sleep(1000)

      const context = results.length > 0
        ? results.map((r, i) => `Step ${i + 1}: ${r.toolOutput ?? 'no output'}`).join('\n')
        : 'No data yet'

      const raw = await callLlm(
        llm,
        executorPrompt(toolList, context),
        `Step: ${stepDescription}`,
      )

      let parsed: { thought: string; tool: string | null; toolInput: string | null }
      try { parsed = safeParseJson(raw) }
      catch { parsed = { thought: stepDescription, tool: null, toolInput: null } }

      const step: AgentStep = {
        thought:   parsed.thought,
        tool:      parsed.tool    ?? null,
        toolInput: parsed.toolInput ?? null,
        toolOutput: null,
      }

      if (parsed.tool) {
        const key = `${parsed.tool}:${parsed.toolInput}`
        if (calledTools.has(key)) {
          step.toolOutput = 'Already called — using previous result'
        } else {
          calledTools.add(key)
          const tool = toolMap.get(parsed.tool)
          if (!tool) {
            step.toolOutput = `Error: unknown tool "${parsed.tool}"`
          } else {
            try {
              step.toolOutput = await tool.run(parsed.toolInput ?? '{}')
            } catch (err) {
              step.toolOutput = `Error: ${(err as Error).message}`
            }
          }
        }
      }

      console.log('[executor]', step.thought, '→', step.toolOutput?.slice(0, 80))
      results.push(step)
      onStep(step)
    }

    return { stepResults: results }
  }

  // ── NODE 4: responder ─────────────────────────────────────────────────
  // Synthesizes all results into one clear final answer.
  async function responderNode(state: State): Promise<Partial<State>> {
    await sleep(300)

    const context = state.stepResults
      .map((s, i) => `Step ${i + 1}:\n  Action: ${s.thought}\n  Result: ${s.toolOutput ?? 'no tool'}`)
      .join('\n\n')

    const finalAnswer = await callLlm(
      llm,
      responderPrompt(),
      `Original goal: ${state.goal}\n\nData collected:\n${context}\n\nWrite the final answer:`,
    )

    const clean = finalAnswer.trim()
    onStep({ thought: 'Synthesizing final answer', tool: null, toolInput: null, toolOutput: clean })
    console.log('[responder] done')
    return { finalAnswer: clean }
  }

  // ── COMPILE ───────────────────────────────────────────────────────────
  return new StateGraph(GraphState)
    .addNode('summarizer',  summarizerNode)
    .addNode('planCreator', planCreatorNode)
    .addNode('executor',    executorNode)
    .addNode('responder',   responderNode)
    .addEdge('__start__',   'summarizer')
    .addEdge('summarizer',  'planCreator')
    .addEdge('planCreator', 'executor')
    .addEdge('executor',    'responder')
    .addEdge('responder',   END)
    .compile()
}
