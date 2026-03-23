// server/lib/llm.ts
// Handles everything related to the LLM:
//   - Creating the right model based on provider
//   - System prompts for each node
//   - Parsing JSON responses safely

import { ChatGroq } from '@langchain/groq'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { McpTool, ProviderName } from '../../types/agent'

// ── LLM FACTORY ───────────────────────────────────────────────────────────

export function createLlm(provider: ProviderName, apiKey: string) {
  if (provider === 'groq') {
    return new ChatGroq({ apiKey, model: 'llama-3.1-8b-instant', temperature: 0 })
  }
  if (provider === 'gemini') {
    return new ChatGoogleGenerativeAI({ apiKey, model: 'gemini-2.0-flash-lite', temperature: 0 })
  }
  if (provider === 'openai') {
    return new ChatOpenAI({ apiKey, model: 'gpt-4o-mini', temperature: 0 })
  }
  throw new Error(`Unsupported provider: ${provider}`)
}

export type LlmInstance = ReturnType<typeof createLlm>

// ── CALL LLM ──────────────────────────────────────────────────────────────

export async function callLlm(
  llm: LlmInstance,
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

// ── PROMPTS ───────────────────────────────────────────────────────────────

export function summarizerPrompt(): string {
  return `You are a goal clarifier. Rewrite the user's goal as one clear, specific,
actionable sentence. Remove all ambiguity. Be precise about what needs to be done.
Reply with ONLY the clarified sentence — no explanation, no extra text.`
}

export function planCreatorPrompt(toolList: string): string {
  return `You are a task planner. Create a step-by-step plan to achieve the goal.

Available tools:
${toolList}

Rules:
- Maximum 4 steps total
- Each step must use exactly one tool OR state that it synthesizes data
- The last step must always be: "Synthesize all collected data into a final answer"
- Be specific about which tool and what input to use

Reply ONLY with a JSON array of step descriptions:
["step 1 description", "step 2 description", ...]`
}

export function executorPrompt(toolList: string, context: string): string {
  return `You are a tool executor. Decide how to execute the given step.

Available tools:
${toolList}

Data collected so far:
${context}

Reply ONLY in this exact JSON format (no markdown):
{
  "thought": "brief reason for this action",
  "tool": "tool_name or null if synthesizing",
  "toolInput": "valid JSON string as tool input, or null"
}`
}

export function responderPrompt(): string {
  return `You are a response writer. Given the original goal and all collected data,
write a clear, helpful, and well-formatted final answer for the user.
Be concise but complete. Use bullet points where appropriate.`
}

// ── JSON PARSER ───────────────────────────────────────────────────────────

export function safeParseJson<T>(text: string): T {
  const cleaned = text
    .replace(/```json|```/g, '')
    .replace(/[\u2018\u2019\u201C\u201D]/g, '"')
    .trim()

  const match = cleaned.match(/[\[\{][\s\S]*[\]\}]/)
  if (!match) throw new Error(`No JSON found in: ${text.slice(0, 100)}`)

  const fixed = match[0].replace(/:\s*"([\s\S]*?)"/g, (_m, v) =>
    `: "${v
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')}"`,
  )

  try { return JSON.parse(fixed) }
  catch { return JSON.parse(match[0]) }
}
