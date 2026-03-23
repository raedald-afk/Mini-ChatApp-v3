// types/agent.ts
// Shared TypeScript types used across the entire project

export type ProviderName = 'groq' | 'gemini' | 'openai' | 'claude'

// One reasoning step in the agent loop
export interface AgentStep {
  thought: string
  tool: string | null
  toolInput: string | null
  toolOutput: string | null
}

// The full state that flows through every LangGraph node
export interface AgentState {
  goal: string
  summary: string
  plan: string[]
  stepResults: AgentStep[]
  finalAnswer: string | null
}

// Every MCP tool must implement this interface
export interface McpTool {
  name: string
  description: string
  run: (input: string) => Promise<string>
}



// ── UI TYPES ──────────────────────────────────────────────────────────────

export interface HistoryEntry {
    goal: string
    provider: ProviderName
    steps: AgentStep[]
    answer: string | null
    error: string | null
}