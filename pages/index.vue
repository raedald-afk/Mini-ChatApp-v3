<template>
    <div class="terminal">

        <!-- Scrollable output area -->
        <div class="output" ref="outputEl">
            <p class="intro">TaskRunner v3 — LangGraph + Prompt Chaining — type a goal and press Enter</p>

            <!-- Conversation history -->
            <template v-for="(entry, i) in history" :key="i">

                <!-- User goal line with provider badge -->
                <div class="user-line">
                    <span class="prompt">$</span>
                    <span class="provider-badge">{{ entry.provider }}</span>
                    <span>{{ entry.goal }}</span>
                </div>

                <!-- Agent reasoning steps -->
                <div v-for="(step, j) in entry.steps" :key="j" class="step">
                    <p class="thought">💭 {{ step.thought }}</p>
                    <p v-if="step.tool" class="tool-call">⚙ {{ step.tool }}({{ step.toolInput }})</p>
                    <p v-if="step.toolOutput" class="tool-output">→ {{ step.toolOutput }}</p>
                </div>

                <!-- Final answer -->
                <p v-if="entry.answer" class="answer">✓ {{ entry.answer }}</p>

                <!-- Error -->
                <p v-if="entry.error" class="error-line">✗ {{ entry.error }}</p>

            </template>

            <!-- Thinking indicator -->
            <p v-if="isRunning" class="thinking">thinking<span class="dots">...</span></p>
        </div>

        <!-- Fixed input bar -->
        <div class="input-row">
            <span class="prompt">$</span>

            <select v-model="selectedProvider" :disabled="isRunning" class="provider-select">
                <option value="groq">Groq (Free)</option>
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
            </select>

            <input class="goal-input"
                   v-model="input"
                   :disabled="isRunning"
                   placeholder="Enter your goal…"
                   @keydown.enter="submit"
                   autofocus />
        </div>

    </div>
</template>

<script setup lang="ts">
    import { ref, nextTick } from 'vue' // Fixes 'ref' and 'nextTick'
    import type { HistoryEntry, ProviderName } from '../types/agent.ts'
    import { useAgent } from '../composables/useAgent'
  
    // Import external CSS
    import '../assets/css/terminal.css'

    const { steps, finalAnswer, isRunning, error, runGoal } = useAgent()

    const input = ref('')
    const selectedProvider = ref<ProviderName>('groq')
    const history = ref<HistoryEntry[]>([])
    const outputEl = ref<HTMLElement | null>(null)

    async function submit() {
        const goal = input.value.trim()
        if (!goal || isRunning.value) return

        input.value = ''

        const entry: HistoryEntry = {
            goal,
            provider: selectedProvider.value,
            steps: [],
            answer: null,
            error: null,
        }
        history.value.push(entry)

        await runGoal(goal, selectedProvider.value)

        history.value[history.value.length - 1] = {
            ...entry,
            steps: [...steps.value],
            answer: finalAnswer.value,
            error: error.value,
        }

        await nextTick()
        outputEl.value?.scrollTo({ top: outputEl.value.scrollHeight, behavior: 'smooth' })
    }
</script>