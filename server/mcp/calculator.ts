// server/mcp/calculator.ts
// MCP Tool 3 — Simple math and date utility tool.
// Performs basic arithmetic and returns today's date.
// Useful when the agent needs to count, calculate, or timestamp results.

import type { McpTool } from '../../types/agent'

export const calculatorTool: McpTool = {
  name: 'calculator',
  description:
    'Perform simple math operations or get today\'s date. ' +
    'Input JSON: { "action": "add"|"subtract"|"multiply"|"divide"|"today", "a"?: number, "b"?: number }',

  async run(input: string): Promise<string> {
    const parsed = JSON.parse(input)

    if (!parsed.action) {
      throw new Error('calculator tool requires { action, a?, b? }')
    }

    // Return today's date as a formatted string
    if (parsed.action === 'today') {
      return `Today is: ${new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      })}`
    }

    // Validate that both numbers are provided for math operations
    if (parsed.a === undefined || parsed.b === undefined) {
      throw new Error('math actions require both "a" and "b" numbers')
    }

    const a = Number(parsed.a)
    const b = Number(parsed.b)

    if (parsed.action === 'add')      return `${a} + ${b} = ${a + b}`
    if (parsed.action === 'subtract') return `${a} - ${b} = ${a - b}`
    if (parsed.action === 'multiply') return `${a} × ${b} = ${a * b}`
    if (parsed.action === 'divide') {
      if (b === 0) throw new Error('Cannot divide by zero')
      return `${a} ÷ ${b} = ${a / b}`
    }

    throw new Error(`Unknown action: ${parsed.action}`)
  },
}