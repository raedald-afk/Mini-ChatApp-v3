// composables/useAgent.ts
// Vue composable — manages agent state and consumes the SSE stream.
// Uses @microsoft/fetch-event-source instead of manual stream parsing:
// no while(true), proper abort/cleanup, automatic error handling.
import { ref, nextTick } from 'vue' // Fixes 'ref' and 'nextTick'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import type { AgentStep } from '../types/agent'

export type ProviderName = 'groq' | 'gemini' | 'openai' | 'claude'

export function useAgent() {
    const steps = ref<AgentStep[]>([])
    const finalAnswer = ref<string | null>(null)
    const isRunning = ref(false)
    const error = ref<string | null>(null)

    // Holds the AbortController for the current run — call abort() to cancel mid-stream
    let controller: AbortController | null = null

    /** Cancel a running goal (e.g. user presses Escape or navigates away) */
    function cancel() {
        controller?.abort()
    }

    /**
     * runGoal — POSTs the goal to the server and handles the SSE stream.
     * onLiveStep fires for every incoming step (use it to scroll, animate, etc.)
     */
    async function runGoal(
        goal: string,
        provider: ProviderName = 'groq',
        onLiveStep?: (step: AgentStep) => void,
    ): Promise<void> {
        // Cancel any previous in-flight request
        controller?.abort()
        controller = new AbortController()

        // Reset state for a fresh run
        steps.value = []
        finalAnswer.value = null
        error.value = null
        isRunning.value = true

        try {
            await fetchEventSource('/api/agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goal, provider }),
                signal: controller.signal,

                // Called once when the HTTP response headers arrive
                async onopen(response) {
                    if (!response.ok) {
                        // Read the error body and surface it — don't just show the status code
                        const body = await response.json().catch(() => null)
                        throw new Error(body?.statusMessage ?? `HTTP ${response.status}`)
                    }
                },

                // Called for every SSE message
                onmessage(event) {
                    if (!event.data) return

                    let payload: unknown
                    try {
                        payload = JSON.parse(event.data)
                    } catch {
                        console.warn('[useAgent] unparseable SSE payload:', event.data)
                        return
                    }

                    switch (event.event) {
                        case 'step': {
                            const step = payload as AgentStep
                            const idx = steps.value.findIndex(s => s.thought === step.thought)
                            if (idx >= 0) {
                                steps.value[idx] = step
                            } else {
                                steps.value.push(step)
                                onLiveStep?.(step)
                            }
                            break
                        }
                        case 'done':
                            finalAnswer.value = (payload as { finalAnswer: string }).finalAnswer
                            break
                        case 'error':
                            error.value = (payload as { message: string }).message
                            break
                    }
                },

                // Called if the connection drops unexpectedly
                onerror(err) {
                    // Returning without re-throwing stops the automatic reconnect loop
                    error.value = err instanceof Error ? err.message : 'Connection error'
                    throw err
                },

                // Do not auto-reconnect — each goal is a single, finite run
                openWhenHidden: true,
            })
        } catch (err) {
            // Ignore AbortError (user cancelled) — surface everything else
            if (err instanceof Error && err.name !== 'AbortError') {
                error.value = err.message
            }
        } finally {
            isRunning.value = false
            controller = null
        }
    }

    return { steps, finalAnswer, isRunning, error, runGoal, cancel }
}