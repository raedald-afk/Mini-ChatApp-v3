<template>
  <!-- Terminal-style chat interface -->
  <div class="terminal">

    <!-- Scrollable output area showing all goals, steps, and answers -->
    <div class="output" ref="outputEl">
      <p class="intro">TaskRunner v3 — LangGraph + Prompt Chaining — type a goal and press Enter</p>

      <!-- Loop through conversation history -->
      <template v-for="(entry, i) in history" :key="i">

        <!-- Show the user's goal with a provider badge -->
        <p class="user-line">
          <span class="prompt">$</span>
          <span class="provider-badge">{{ entry.provider }}</span>
          {{ entry.goal }}
        </p>

        <!-- Show each reasoning step from the agent -->
        <div v-for="(step, j) in entry.steps" :key="j" class="step">
          <p class="thought">💭 {{ step.thought }}</p>
          <p v-if="step.tool" class="tool-call">⚙ {{ step.tool }}({{ step.toolInput }})</p>
          <p v-if="step.toolOutput" class="tool-output">→ {{ step.toolOutput }}</p>
        </div>

        <!-- Final answer in green -->
        <p v-if="entry.answer" class="answer">✓ {{ entry.answer }}</p>

        <!-- Error in red -->
        <p v-if="entry.error" class="error-line">✗ {{ entry.error }}</p>

      </template>

      <!-- Animated thinking indicator while agent is running -->
      <p v-if="isRunning" class="thinking">thinking<span class="dots">...</span></p>
    </div>

    <!-- Input bar at the bottom -->
    <div class="input-row">
      <span class="prompt">$</span>

      <!-- Provider dropdown — choose which LLM to use -->
      <select v-model="selectedProvider" :disabled="isRunning" class="provider-select">
        <option value="groq">Groq (Free)</option>
        <option value="gemini">Gemini</option>
        <option value="openai">OpenAI</option>
        <option value="claude">Claude</option>
      </select>

      <!-- Goal input — submits on Enter key -->
      <input
        v-model="input"
        :disabled="isRunning"
        placeholder="Enter your goal…"
        @keydown.enter="submit"
        autofocus
      />
    </div>

  </div>
</template>

<script setup lang="ts">
import type { AgentStep } from '../types/agent'
import type { ProviderName } from '../composables/useAgent'

/** One entry in the conversation history */
interface HistoryEntry {
  goal: string
  provider: ProviderName
  steps: AgentStep[]
  answer: string | null
  error: string | null
}

// Get agent state and the runGoal function from the composable
const { steps, finalAnswer, isRunning, error, runGoal } = useAgent()

const input           = ref('')
const selectedProvider = ref<ProviderName>('groq')
const history         = ref<HistoryEntry[]>([])
const outputEl        = ref<HTMLElement | null>(null)

/**
 * submit — called when the user presses Enter.
 * Adds the goal to history, runs the agent, then updates the entry with results.
 */
async function submit() {
  const goal = input.value.trim()
  if (!goal || isRunning.value) return

  input.value = ''

  // Add the entry immediately so the goal line appears right away
  const entry: HistoryEntry = {
    goal,
    provider: selectedProvider.value,
    steps: [],
    answer: null,
    error: null,
  }
  history.value.push(entry)

  // Run the agent and wait for completion
  await runGoal(goal, selectedProvider.value)

  // Replace the entry in the array so Vue detects the change
  history.value[history.value.length - 1] = {
    ...entry,
    steps:  [...steps.value],
    answer: finalAnswer.value,
    error:  error.value,
  }

  // Scroll to the bottom after new content appears
  await nextTick()
  outputEl.value?.scrollTo({ top: outputEl.value.scrollHeight, behavior: 'smooth' })
}
</script>

<style scoped>
.terminal {
  background: #0d1117;
  color: #c9d1d9;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 14px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 24px;
  width: 70%;
  margin: 0 auto;
}
.output { flex: 1; overflow-y: auto; margin-bottom: 16px; }
.intro  { color: #8b949e; margin-bottom: 16px; }
.user-line {
  color: #79c0ff;
  margin: 12px 0 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.prompt { color: #3fb950; }
.provider-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #21262d;
  color: #8b949e;
  border: 1px solid #30363d;
  text-transform: uppercase;
}
.step        { margin-left: 20px; margin-bottom: 4px; }
.thought     { color: #8b949e; }
.tool-call   { color: #d2a8ff; }
.tool-output { color: #a5d6ff; white-space: pre-wrap; }
.answer      { color: #3fb950; margin: 8px 0 16px; }
.error-line  { color: #f85149; }
.thinking    { color: #8b949e; }
.dots { animation: blink 1.2s step-start infinite; }
@keyframes blink { 50% { opacity: 0 } }
.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid #30363d;
  padding-top: 12px;
}
.provider-select {
  background: #21262d;
  color: #c9d1d9;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 2px 6px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  outline: none;
}
.provider-select:disabled { opacity: 0.5; }
.provider-select option   { background: #21262d; }
input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 14px;
}
input:disabled { opacity: 0.5; }
</style>
