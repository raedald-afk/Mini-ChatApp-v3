export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: false },
  telemetry: false,
  typescript: { strict: true },
  runtimeConfig: {
    groqApiKey:      process.env.GROQ_API_KEY       ?? '',
    geminiApiKey:    process.env.GEMINI_API_KEY     ?? '',
    openaiApiKey:    process.env.OPENAI_API_KEY     ?? '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY  ?? '',
  },
})