// server/api/agent.post.ts
// HTTP endpoint: POST /api/agent
// Receives the user's goal and selected provider from the frontend,
// runs the LangGraph agent, and streams each step back via SSE.
// SSE (Server-Sent Events) keeps the connection open so the UI
// can show each reasoning step as it happens in real time.

import { runTaskRunner } from '../lib/runner'
import { filesystemTool } from '../mcp/filesystem'
import { summariseTool }  from '../mcp/summarise'
import { calculatorTool } from '../mcp/calculator'
import { weatherTool }    from '../mcp/weather'
import type { AgentStep, ProviderName } from '../../types/agent'

export default defineEventHandler(async (event) => {
  // Read and validate the request body
  const body = await readBody(event)

  if (!body?.goal || typeof body.goal !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing "goal" in request body' })
  }

  const provider: ProviderName = body.provider ?? 'groq'
  if (!['groq', 'gemini', 'openai', 'claude'].includes(provider)) {
    throw createError({ statusCode: 400, statusMessage: `Unknown provider: ${provider}` })
  }

  // Get the API key for the selected provider from environment variables
  const keyMap: Record<ProviderName, string> = {
    groq:   process.env.GROQ_API_KEY   ?? '',
    gemini: process.env.GEMINI_API_KEY ?? '',
    openai: process.env.OPENAI_API_KEY ?? '',
    claude: process.env.ANTHROPIC_API_KEY ?? '',
  }

  const apiKey = keyMap[provider]
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: `API key not set for: ${provider}` })
  }

  // Register all MCP tools available to the agent
    const tools = [filesystemTool, summariseTool, calculatorTool, weatherTool]
    const encoder = new TextEncoder()

  // Set SSE headers to keep the connection open for streaming
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  // Create a readable stream that pushes events as the agent works
  const stream = new ReadableStream({
    async start(controller) {
      // Helper to push one SSE message into the stream
      const send = (eventName: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      try {
        const finalAnswer = await runTaskRunner(
          body.goal,
          provider,
          apiKey,
          tools,
          (step: AgentStep) => send('step', step), // stream each step live
        )
        send('done', { finalAnswer })
      } catch (err) {
        send('error', { message: (err as Error).message })
      } finally {
        controller.close()
      }
    },
  })

  return sendStream(event, stream)
})
