// server/mcp/summarise.ts
import type { McpTool } from '../../types/agent'

export const summariseTool: McpTool = {
  name: 'summarise',
  description:
    'Transform or summarise text. ' +
    'Input JSON: { "action": "bullets"|"wordcount"|"uppercase"|"summary", "text": "..." }',

  async run(input: string): Promise<string> {
    const parsed = JSON.parse(input)

    if (!parsed.action || !parsed.text) {
      throw new Error('summarise tool requires { action, text }')
    }

    const text: string = parsed.text

    // Convert each line into a bullet point
    if (parsed.action === 'bullets') {
      return text
        .split(/\n+/)
        .map((l: string) => l.trim())
        .filter(Boolean)
        .map((l: string) => `• ${l}`)
        .join('\n')
    }

    // Count the total number of words in the text
    if (parsed.action === 'wordcount') {
      const count = text.trim().split(/\s+/).length
      return `Word count: ${count}`
    }

    // Convert all text to uppercase letters
    if (parsed.action === 'uppercase') {
      return text.toUpperCase()
    }

    // Simple extractive summary
    if (parsed.action === 'summary') {
      // Split into sentences
      const sentences = text.match(/[^.!?]+[.!?]?/g) || []

      // Count word frequency
      const freq: Record<string, number> = {}
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .forEach(word => (freq[word] = (freq[word] || 0) + 1))

      // Score sentences by word frequency
      const scored = sentences.map(s => {
        const words = s.toLowerCase().split(/\s+/)
        const score = words.reduce((acc, w) => acc + (freq[w] || 0), 0)
        return { sentence: s.trim(), score }
      })

      // Pick top 3 sentences
      const top = scored.sort((a, b) => b.score - a.score).slice(0, 3)

      return top.map(t => `• ${t.sentence}`).join('\n')
    }

    throw new Error(`Unknown action: ${parsed.action}`)
  },
}
