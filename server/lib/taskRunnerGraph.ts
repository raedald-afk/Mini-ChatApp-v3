// server/lib/taskRunnerGraph.ts
//
// ARCHITECTURE: Prompt Chaining with LangGraph
// The agent runs through four specialized nodes in sequence:
//
//   [summarizer] → [planCreator] → [executor] → [responder]
//
// Each node has ONE job and passes its output to the next node via shared state.
//
// WHY PROMPT CHAINING?
// - Each node focuses on one task → better quality output per step
// - Easy to debug: you can see exactly which step produced wrong output
// - Easy to extend: add or remove nodes without rewriting the whole agent
// - State flows naturally between nodes without manual passing

import { ChatGroq } from '@langchain/groq'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { StateGraph, Annotation, END } from '@langchain/langgraph'
import type { AgentStep, McpTool, ProviderName } from '../../types/agent'

// Delay helper — avoids rate limit errors on free API tiers
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Simple console logger — replaces LangSmith for local/CodeSandbox use
function log(node: string, message: string, data?: unknown) {
  console.log(`\n[${node.toUpperCase()}] ${message}`)
  if (data) console.log('  →', JSON.stringify(data).slice(0, 200))
}

// ── LANGGRAPH STATE SCHEMA ─────────────────────────────────────────────────
// Defines the shape of state that flows through all nodes.
// Each node reads from state and returns a partial update.
const GraphState = Annotation.Root({
  // The original user goal — set at the start and never changed
  goal: Annotation<string>(),

  // Node 1 output: a clarified one-sentence version of the goal
  summary: Annotation<string>({ default: () => '' }),

  // Node 2 output: an ordered list of steps to execute
  plan: Annotation<string[]>({ default: () => [] }),

  // Node 3 output: results from executing each step with MCP tools
  stepResults: Annotation<AgentStep[]>({
    default: () => [],
    reducer: (_, b) => b, // always replace with the latest full array
  }),

  // Node 4 output: the final answer shown to the user
  finalAnswer: Annotation<string | null>({ default: () => null }),
})

type State = typeof GraphState.State

// ── LLM FACTORY ───────────────────────────────────────────────────────────
// Returns the correct LangChain chat model based on the provider name.
// All models share the same .invoke() interface so nodes work with any of them.
function createLlm(provider: ProviderName, apiKey: string) {
  if (provider === 'groq') {
    return new ChatGroq({
      apiKey,
      model: 'llama-3.1-8b-instant',
      temperature: 0,
    })
  }
  if (provider === 'gemini') {
    return new ChatGoogleGenerativeAI({
      apiKey,
      model: 'gemini-2.0-flash-lite',
      temperature: 0,
    })
  }
  if (provider === 'openai') {
    return new ChatOpenAI({
      apiKey,
      model: 'gpt-4o-mini',
      temperature: 0,
    })
  }
  throw new Error(`Unsupported provider: ${provider}`)
}

// ── HELPER: Send a prompt to the LLM and return plain text ─────────────────
// Wraps llm.invoke() to always return a plain string regardless of model.
async function callLlm(
  llm: ReturnType<typeof createLlm>,
  system: string,
  user: string,
): Promise<string> {
  const response = await llm.invoke([
    new SystemMessage(system),
    new HumanMessage(user),
  ])
  return typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content)
}

// ── HELPER: Extract JSON from LLM response text ────────────────────────────
// LLMs sometimes wrap JSON in markdown fences or use curly/smart quotes.
// This function strips that noise and parses the JSON safely.
function safeParseJson<T>(text: string): T {
  const cleaned = text
    .replace(/```json|```/g, '')
    .replace(/[\u2018\u2019\u201C\u201D]/g, '"')
    .trim()

  const match = cleaned.match(/[\[\{][\s\S]*[\]\}]/)
  if (!match) throw new Error(`No JSON found in: ${text.slice(0, 100)}`)

  // Fix unescaped newlines that break JSON.parse
  const fixed = match[0].replace(/:\s*"([\s\S]*?)"/g, (_m, v) =>
    `: "${v
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')}"`,
  )

  try {
    return JSON.parse(fixed)
  } catch {
    return JSON.parse(match[0])
  }
}

// ── MAIN: Build and compile the LangGraph ─────────────────────────────────
// Creates all four nodes, wires them into a linear chain, and compiles
// the graph into a runnable object.
export function buildGraph(
  provider: ProviderName,
  apiKey: string,
  tools: McpTool[],
  onStep: (step: AgentStep) => void, // called after each step to update the UI
) {
  const llm     = createLlm(provider, apiKey)
  const toolMap = new Map(tools.map(t => [t.name, t]))
  const toolList = tools.map(t => `  - ${t.name}: ${t.description}`).join('\n')

  // ── NODE 1: summarizer ────────────────────────────────────────────────
  // Takes the raw user goal and rewrites it as a single clear sentence.
  // This removes ambiguity so later nodes work with a precise instruction.
  async function summarizerNode(state: State): Promise<Partial<State>> {
    await sleep(300)

    const summary = await callLlm(
      llm,
      `You are a goal clarifier. Rewrite the user's goal as one clear, specific,
actionable sentence. Remove all ambiguity. Be precise about what needs to be done.
Reply with ONLY the clarified sentence — no explanation, no extra text.`,
      `Goal: ${state.goal}`,
    )

    const clean = summary.trim()
    log('summarizer', 'Goal clarified', clean)

    // Emit a synthetic step so the UI shows this node ran
    onStep({
      thought:   `Understood: ${clean}`,
      tool:      null,
      toolInput: null,
      toolOutput: null,
    })

    return { summary: clean }
  }

  // ── NODE 2: planCreator ───────────────────────────────────────────────
  // Reads the clarified summary and produces a step-by-step execution plan.
  // Each step will be handed to the executor node one by one.
  async function planCreatorNode(state: State): Promise<Partial<State>> {
    await sleep(300)

    const raw = await callLlm(
      llm,
      `You are a task planner. Create a step-by-step plan to achieve the goal.

Available tools:
${toolList}

Rules:
- Maximum 4 steps total
- Each step must use exactly one tool OR state that it synthesizes data
- The last step must always be: "Synthesize all collected data into a final answer"
- Be specific about which tool and what input to use

Reply ONLY with a JSON array of step descriptions:
["step 1 description", "step 2 description", ...]`,
      `Goal: ${state.summary}`,
    )

    const plan = safeParseJson<string[]>(raw)
    log('planCreator', `Plan created (${plan.length} steps)`, plan)

    onStep({
      thought:   `Plan ready: ${plan.length} steps to execute`,
      tool:      null,
      toolInput: null,
      toolOutput: null,
    })

    return { plan }
  }

  // ── NODE 3: executor ──────────────────────────────────────────────────
  // Runs each step in the plan one by one.
  // For each step it asks the LLM which tool to call, runs the tool,
  // saves the result, and streams the step to the UI.
  async function executorNode(state: State): Promise<Partial<State>> {
    const results: AgentStep[]  = []
    const calledTools = new Set<string>() // prevents calling the same tool twice

    for (const stepDescription of state.plan) {
      await sleep(1000)

      // Build a context summary from steps already completed
      const context = results.length > 0
        ? results
            .map((r, i) => `Step ${i + 1} result: ${r.toolOutput ?? 'no output'}`)
            .join('\n')
        : 'No data collected yet'

      // Ask the LLM how to execute this specific step
      const raw = await callLlm(
        llm,
        `You are a tool executor. Decide how to execute the given step.

Available tools:
${toolList}

Data collected so far:
${context}

Reply ONLY in this exact JSON format (no markdown):
{
  "thought": "brief reason for this action",
  "tool": "tool_name or null if synthesizing",
  "toolInput": "valid JSON string as tool input, or null"
}`,
        `Step to execute: ${stepDescription}`,
      )

      // Parse the LLM's decision — fall back to a safe default if it fails
      let parsed: { thought: string; tool: string | null; toolInput: string | null }
      try {
        parsed = safeParseJson(raw)
      } catch {
        parsed = { thought: stepDescription, tool: null, toolInput: null }
      }

      const step: AgentStep = {
        thought:   parsed.thought,
        tool:      parsed.tool    ?? null,
        toolInput: parsed.toolInput ?? null,
        toolOutput: null,
      }

      // Run the selected MCP tool if the LLM chose one
      if (parsed.tool) {
        const toolKey = `${parsed.tool}:${parsed.toolInput}`

        // Skip if we already called this exact tool with the same input
        if (calledTools.has(toolKey)) {
          step.toolOutput = 'Already called with same input — using previous result'
        } else {
          calledTools.add(toolKey)
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

      log('executor', `Step done: ${stepDescription}`, step.toolOutput)
      results.push(step)
      onStep(step) // send to UI immediately
    }

    return { stepResults: results }
  }

  // ── NODE 4: responder ─────────────────────────────────────────────────
  // Receives all step results and writes one clear final answer for the user.
  // This is the only output the user ultimately sees as the final response.
  async function responderNode(state: State): Promise<Partial<State>> {
    await sleep(300)

    // Build a readable summary of everything collected by the executor
    const context = state.stepResults
      .map((s, i) =>
        `Step ${i + 1}:\n  Action: ${s.thought}\n  Result: ${s.toolOutput ?? 'no tool used'}`,
      )
      .join('\n\n')

    const finalAnswer = await callLlm(
      llm,
      `You are a response writer. Given the original goal and all collected data,
write a clear, helpful, and well-formatted final answer for the user.
Be concise but complete. Use bullet points where appropriate.`,
      `Original goal: ${state.goal}

Data collected:
${context}

Write the final answer:`,
    )

    const clean = finalAnswer.trim()
    log('responder', 'Final answer ready')

    onStep({
      thought:   'Synthesizing final answer from all collected data',
      tool:      null,
      toolInput: null,
      toolOutput: clean,
    })

    return { finalAnswer: clean }
  }

  // ── COMPILE THE GRAPH ──────────────────────────────────────────────────
  // Wire the four nodes into a linear chain and compile it into a runner.
  // Flow: START → summarizer → planCreator → executor → responder → END
  const graph = new StateGraph(GraphState)
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

  return graph
}

// ── ENTRY POINT ────────────────────────────────────────────────────────────
// Called by the server route to run the full agent for one user goal.
// Builds the graph, invokes it with initial state, and returns the final answer.
export async function runTaskRunner(
  goal: string,
  provider: ProviderName,
  apiKey: string,
  tools: McpTool[],
  onStep: (step: AgentStep) => void,
): Promise<string> {
  log('taskrunner', `Starting — goal: "${goal}" — provider: ${provider}`)

  const graph = buildGraph(provider, apiKey, tools, onStep)

  const result = await graph.invoke({
    goal,
    summary:     '',
    plan:        [],
    stepResults: [],
    finalAnswer: null,
  })

  return result.finalAnswer ?? 'Could not produce a final answer.'
}