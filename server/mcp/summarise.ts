// server/mcp/summarise.ts
// MCP Tool 2 — Text transformation tool.
// Converts text to bullet points, counts words, or converts to uppercase.
// Used by the agent to format and summarise content after reading files.

import type { McpTool } from '../../types/agent'

export const summariseTool: McpTool = {
  name: 'summarise',
  description:
    'Transform or summarise text. ' +
    'Input JSON: { "action": "bullets"|"wordcount"|"uppercase", "text": "..." }',

  async run(input: string): Promise<string> {
    const parsed = JSON.parse(input)

    if (!parsed.action || !parsed.text) {
      throw new Error('summarise tool requires { action, text }')
    }

    // Convert each line into a bullet point
    if (parsed.action === 'bullets') {
      return parsed.text
        .split(/\n+/)
        .map((l: string) => l.trim())
        .filter(Boolean)
        .map((l: string) => `• ${l}`)
        .join('\n')
    }

    // Count the total number of words in the text
    if (parsed.action === 'wordcount') {
      const count = parsed.text.trim().split(/\s+/).length
      return `Word count: ${count}`
    }

    // Convert all text to uppercase letters
    if (parsed.action === 'uppercase') {
      return parsed.text.toUpperCase()
    }

    throw new Error(`Unknown action: ${parsed.action}`)
  },
}
