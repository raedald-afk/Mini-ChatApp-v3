// composables/useAgent.ts
// Vue composable that manages the agent's reactive state and
// reads the SSE stream from the server, updating the UI live.
// In Nuxt 3, composables in this folder are auto-imported everywhere.

import type { AgentStep } from '../types/agent'

export type ProviderName = 'groq' | 'gemini' | 'openai' | 'claude'

export function useAgent() {
  // Reactive state — Vue re-renders the UI whenever these change
  const steps       = ref<AgentStep[]>([])
  const finalAnswer = ref<string | null>(null)
  const isRunning   = ref(false)
  const error       = ref<string | null>(null)

  /**
   * runGoal — sends the goal to the server and reads the SSE stream.
   * Each SSE event updates the reactive state, which updates the UI instantly.
   */
  async function runGoal(goal: string, provider: ProviderName = 'groq') {
    // Reset state for a fresh run
    steps.value       = []
    finalAnswer.value = null
    error.value       = null
    isRunning.value   = true

    // Send the goal and provider to the server
    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, provider }),
    })

    if (!response.ok || !response.body) {
      error.value = `HTTP ${response.status}`
      isRunning.value = false
      return
    }

    // Read the SSE stream chunk by chunk
    const reader  = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer    = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE messages are separated by double newlines
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const eventMatch = part.match(/^event: (\w+)/)
        const dataMatch  = part.match(/^data: (.+)/m)
        if (!eventMatch || !dataMatch) continue

        const eventType = eventMatch[1]
        const payload   = JSON.parse(dataMatch[1])

        // Update the right piece of state based on event type
        if (eventType === 'step') {
          // Update existing step if thought matches, or add a new one
          const idx = steps.value.findIndex(s => s.thought === payload.thought)
          if (idx >= 0) steps.value[idx] = payload
          else steps.value.push(payload)
        }
        if (eventType === 'done')  finalAnswer.value = payload.finalAnswer
        if (eventType === 'error') error.value = payload.message
      }
    }

    isRunning.value = false
  }

  return { steps, finalAnswer, isRunning, error, runGoal }
}
