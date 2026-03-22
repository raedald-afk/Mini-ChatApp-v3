// server/mcp/filesystem.ts
// MCP Tool 1 — Read and write markdown files inside the notes/ folder.
// The agent uses this tool to read notes and save results to disk.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { McpTool } from '../../types/agent'

const NOTES_DIR = resolve(process.cwd(), 'notes')

export const filesystemTool: McpTool = {
  name: 'filesystem',
  description:
    'Read or write markdown files in the notes directory. ' +
    'Input JSON: { "action": "read"|"write", "path": "filename.md", "content"?: "..." }',

  async run(input: string): Promise<string> {
    const parsed = JSON.parse(input)

    if (!parsed.action || !parsed.path) {
      throw new Error('filesystem tool requires { action, path, content? }')
    }

    // Build the full path and block any path traversal attacks
    const safePath = resolve(NOTES_DIR, parsed.path)
    if (!safePath.startsWith(NOTES_DIR)) {
      throw new Error('Path traversal not allowed')
    }

    // Read a file and return its contents as a string
    if (parsed.action === 'read') {
      return await readFile(safePath, 'utf-8')
    }

    // Write content to a file, creating folders if needed
    if (parsed.action === 'write') {
      if (!parsed.content) throw new Error('write action requires content')
      await mkdir(dirname(safePath), { recursive: true })
      await writeFile(safePath, parsed.content, 'utf-8')
      return `Written ${parsed.path} (${parsed.content.length} chars)`
    }

    throw new Error(`Unknown action: ${parsed.action}`)
  },
}
