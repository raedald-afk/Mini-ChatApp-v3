# 🤖 TaskRunner v3 — Agentic Chat System

![Nuxt 3](https://img.shields.io/badge/Nuxt-3-00DC82?style=flat-square&logo=nuxt.js)
![LangGraph](https://img.shields.io/badge/LangGraph-0.2-1D9E75?style=flat-square)
![LangChain](https://img.shields.io/badge/LangChain-latest-7F77DD?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

> A lightweight agentic system built with **Nuxt 3**, **LangGraph**, and **LangChain** that uses **Prompt Chaining** to break complex goals into steps and execute them automatically using MCP tools.

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Why Prompt Chaining?](#-why-prompt-chaining)
- [MCP Tools](#-mcp-tools)
- [Agent State](#-agent-state)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [AI Providers](#-ai-providers)
- [Project Structure](#-project-structure)
- [How It Works](#-how-it-works)
- [Example Goals](#-example-goals)
- [Running Tests](#-running-tests)
- [Architecture Decisions](#-architecture-decisions)
- [Future Improvements](#-future-improvements)

---

## 🧠 Overview

TaskRunner v3 is an AI agent that accepts high-level goals from the user, breaks them into concrete steps using **Prompt Chaining**, executes each step with **MCP tools**, and produces a final coherent answer — all automatically.

The user types a goal like:

```
read week.md and summarise it as bullet points
```

And the agent handles everything: reading the file, transforming the text, and writing a clean final answer.

---

## 🏗️ Architecture

TaskRunner uses a **four-node Prompt Chain** built with LangGraph:

```
User types a goal
      ↓
[summarizer]   — clarifies the goal into one precise sentence
      ↓
[planCreator]  — breaks it into up to 4 concrete steps
      ↓
[executor]     — runs each step using MCP tools
      ↓
[responder]    — synthesizes all results into a final answer
      ↓
Final answer streamed to the UI via SSE
```

Each node is a pure async function that reads from shared state and returns a partial update. The state flows automatically between nodes via LangGraph's `StateGraph`.

---

## 💡 Why Prompt Chaining?

Instead of one large prompt that asks the AI to do everything at once, Prompt Chaining splits the work into **specialized nodes**. Each node has a single, focused responsibility.

| Approach | Problem |
|----------|---------|
| Single large prompt | Unpredictable output, hard to debug |
| Prompt Chaining | Each step is focused, testable, and easy to fix |

**Benefits in this project:**

- The `summarizer` removes ambiguity before planning starts
- The `planCreator` decides the steps without being distracted by tool details
- The `executor` focuses purely on tool calls — one step at a time
- The `responder` synthesizes clearly because it has all data ready

This mirrors the architecture in [BirgitPohl's prompt-chaining example](https://github.com/BirgitPohl/example-prompt-chaining-with-langgraph).

---

## 🛠️ MCP Tools

The agent has access to three MCP (Model Context Protocol) tools:

### 1. filesystem

Reads and writes Markdown files inside the `notes/` folder.

```json
{ "action": "read",  "path": "week.md" }
{ "action": "write", "path": "output.md", "content": "..." }
```

> ⚠️ Path traversal protection is built in — the agent cannot access files outside `notes/`.

### 2. summarise

Performs text transformations on any string.

```json
{ "action": "bullets",   "text": "..." }
{ "action": "wordcount", "text": "..." }
{ "action": "uppercase", "text": "..." }
```

### 3. calculator

Performs basic math and returns the current date.

```json
{ "action": "add",      "a": 15, "b": 27 }
{ "action": "subtract", "a": 100, "b": 42 }
{ "action": "multiply", "a": 6,  "b": 7  }
{ "action": "divide",   "a": 100, "b": 4  }
{ "action": "today" }
```

---

## 🔄 Agent State

The LangGraph state flows through all four nodes. Each node reads from and writes to this shared object:

| Field | Type | Description |
|-------|------|-------------|
| `goal` | `string` | The original user goal — never modified |
| `summary` | `string` | Clarified goal from the summarizer node |
| `plan` | `string[]` | List of steps from the planCreator node |
| `stepResults` | `AgentStep[]` | Tool call results from the executor node |
| `finalAnswer` | `string \| null` | The finished answer from the responder node |

Each `AgentStep` contains:

```ts
{
  thought:    string        // why the agent took this action
  tool:       string | null // which MCP tool was called
  toolInput:  string | null // the JSON input sent to the tool
  toolOutput: string | null // the result returned by the tool
}
```

---

## 📋 Prerequisites

- Node.js 18 or higher
- At least one API key — **Groq is free** and recommended

---

## 🚀 Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd mini-chatapp-v3

# Install dependencies
npm install
```

---

## ⚙️ Configuration

Create a `.env` file in the root directory:

```env
GROQ_API_KEY=your_groq_key_here
GEMINI_API_KEY=your_gemini_key_here
OPENAI_API_KEY=your_openai_key_here
```

> 💡 You only need keys for the providers you want to use. **Groq** is recommended — it is free, fast, and has a generous daily limit.

---

## 💻 Usage

```bash
# Start the development server
npm run dev

# Build for production
npm run build

# Start the production server
npm start

# Run tests
npm test
```

Open your browser at `http://localhost:3000` and type a goal in the terminal.

---

## 🤖 AI Providers

Select the provider from the dropdown in the UI before submitting a goal.

| Provider | Model | Speed | Cost | Get Key |
|----------|-------|-------|------|---------|
| **Groq ⭐** | `llama-3.1-8b-instant` | Very fast | Free — 14,400 req/day | [console.groq.com](https://console.groq.com) |
| **Gemini** | `gemini-2.0-flash-lite` | Fast | Free (limited) | [aistudio.google.com](https://aistudio.google.com) |
| **OpenAI** | `gpt-4o-mini` | Fast | Paid | [platform.openai.com](https://platform.openai.com) |

---

## 📁 Project Structure

```
mini-chatapp-v3/
├── pages/
│   └── index.vue                  # Terminal UI — the only page the user sees
├── composables/
│   └── useAgent.ts                # Manages reactive state + reads SSE stream
├── server/
│   ├── api/
│   │   └── agent.post.ts          # POST /api/agent — SSE endpoint
│   ├── lib/
│   │   └── taskRunnerGraph.ts     # LangGraph — 4-node prompt chain
│   └── mcp/
│       ├── filesystem.ts          # MCP Tool 1 — read/write files
│       ├── summarise.ts           # MCP Tool 2 — text transformations
│       └── calculator.ts          # MCP Tool 3 — math + date
├── types/
│   └── agent.ts                   # Shared TypeScript types
├── notes/
│   └── week.md                    # Sample notes file for testing
├── tests/
│   └── agent.test.ts              # Vitest unit tests
├── nuxt.config.ts                 # Nuxt 3 configuration
├── package.json
└── .env                           # API keys — never commit this file
```

---

## 🔍 How It Works

### Step 1 — User submits a goal

The user types a goal in the terminal UI and presses Enter. The `index.vue` page calls `runGoal()` from the `useAgent` composable.

### Step 2 — Frontend sends to server

`useAgent.ts` sends a `POST /api/agent` request with `{ goal, provider }` and opens an SSE connection to receive live updates.

### Step 3 — Server runs LangGraph

`agent.post.ts` reads the request, picks the right API key, and calls `runTaskRunner()` from `taskRunnerGraph.ts`.

### Step 4 — Four-node prompt chain executes

```
summarizer  → clarifies the goal into one sentence
planCreator → creates up to 4 concrete steps
executor    → runs each step with the right MCP tool
responder   → writes the final answer from all results
```

Each node emits an SSE `step` event that the frontend receives and displays immediately.

### Step 5 — Final answer streams to UI

When the `responder` node finishes, the server sends a `done` event with the final answer. The UI displays it in green.

---

## 💬 Example Goals

```
read the file week.md
read week.md and summarise it as bullet points
read week.md and tell me what was blocked this week
read week.md and count the words
write a file called summary.md with a summary of week.md
what is today's date
calculate 15 + 27
calculate 100 divided by 4
write a file called numbers.md with content: random number is 42
just say hello
```

---

## 🧪 Running Tests

```bash
npm test
```

The test suite covers all three MCP tools:

```
✓ summariseTool  converts text to bullet points
✓ summariseTool  counts words correctly
✓ summariseTool  throws on missing action
✓ calculatorTool adds two numbers
✓ calculatorTool returns today's date
✓ calculatorTool throws on divide by zero
```

---

## 💡 Architecture Decisions

### Why Nuxt 3?

Nuxt 3 works on CodeSandbox and provides server-side API routes out of the box. A single `npm run dev` starts both the frontend and the backend — no separate Express server needed.

### Why LangGraph?

LangGraph models the agent as a directed graph of nodes. Each node is a pure function with a single responsibility. This makes the agent easy to debug (you can see exactly which node failed), easy to extend (add a node without changing others), and produces higher quality output (each prompt is focused on one task).

### Why Prompt Chaining?

A single large prompt asking the AI to plan, execute, and summarize all at once produces inconsistent results. Splitting into four specialized nodes gives each LLM call a clear, focused task. The output quality improves significantly at each stage.

### Why Server-Sent Events (SSE)?

SSE keeps the connection open so the server can push each reasoning step to the UI as it happens. The user sees the agent thinking in real time rather than waiting for a single response at the end.

### Why three MCP tools?

The three tools cover the three main categories required by the assignment: file system access (`filesystem`), text transformation (`summarise`), and math/utility operations (`calculator`). Together they demonstrate the agent's ability to combine different tool types to solve a goal.

---

## 🔮 Future Improvements

- [ ] Add a web search tool using a free API (e.g. DuckDuckGo)
- [ ] Persist conversation history using SQLite
- [ ] Add proper MCP SDK integration with stdio transport
- [ ] Add retry logic around API calls that hit rate limits
- [ ] Add more test coverage: route validation, filesystem edge cases
- [ ] Docker support for easy deployment
- [ ] Stream token-by-token instead of step-by-step

---

## 📄 License

MIT © 2026 TaskRunner v3
