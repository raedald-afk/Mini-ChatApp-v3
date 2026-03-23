# TaskRunner v3

> A lightweight agentic system built with **Nuxt 3**, **LangGraph**, and **LangChain** that uses prompt chaining to break natural-language goals into steps, execute them with real tools, and stream the reasoning live to a terminal UI.

---

## Table of contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Why prompt chaining?](#why-prompt-chaining)
- [MCP tools](#mcp-tools)
- [AI providers](#ai-providers)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Usage](#usage)
- [Running tests](#running-tests)
- [What I would do differently](#what-i-would-do-differently)

---

## Overview

TaskRunner v3 is an AI agent that accepts a high-level goal, breaks it into a plan, executes each step with the right tool, and produces a coherent final answer — all streamed live to a terminal-style browser UI.

Type a goal like:

```
read week.md and summarise it as bullet points
```

The agent reads the file, transforms the text, and writes back a clean answer — step by step, visible in real time.

---

## Architecture

TaskRunner uses a **four-node prompt chain** built with LangGraph. Each node is a pure async function with a single responsibility. Shared state flows automatically between nodes.

```
User goal
    │
    ▼
┌─────────────┐
│  summarizer │  Rewrites the goal as one clear, precise sentence
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ planCreator │  Breaks the goal into up to 4 concrete steps
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  executor   │  Runs each step using the right MCP tool
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  responder  │  Synthesizes all results into a final answer
└──────┬──────┘
       │
       ▼
  SSE stream → terminal UI
```

**Stack:**

| Layer | Technology |
|-------|-----------|
| Frontend | Nuxt 3, Vue 3 |
| Backend | Nitro (Nuxt server routes) |
| Agent | LangGraph, LangChain |
| Streaming | Server-Sent Events via `@microsoft/fetch-event-source` |
| Language | TypeScript (strict mode) |

---

## Why prompt chaining?

A single large prompt asking the model to plan, execute, and synthesize all at once produces inconsistent results. Splitting into four specialized nodes gives each LLM call a focused, predictable task.

| Node | Responsibility | Why it's separate |
|------|---------------|-------------------|
| `summarizer` | Clarify the goal | Removes ambiguity before planning starts |
| `planCreator` | Decide the steps | Focuses on strategy, not tool details |
| `executor` | Call the right tools | One step at a time, with context from prior results |
| `responder` | Write the final answer | Has all data ready; can focus on quality writing |

This mirrors the [prompt chaining architecture](https://www.anthropic.com/research/building-effective-agents) where each LLM call has a clear input and a well-defined output.

---

## MCP tools

The agent has four tools available. Each implements the `McpTool` interface: `{ name, description, run }`.

### filesystem

Reads and writes Markdown files inside the `notes/` directory. Path traversal is blocked at the server.

```json
{ "action": "read",  "path": "week.md" }
{ "action": "write", "path": "output.md", "content": "..." }
```

### weather

Fetches the current temperature for any city using [Open-Meteo](https://open-meteo.com/) — free, no API key needed.

```json
{ "city": "Berlin" }
```

### calculator

Basic arithmetic and the current date.

```json
{ "action": "add",      "a": 15,  "b": 27 }
{ "action": "subtract", "a": 100, "b": 42 }
{ "action": "multiply", "a": 6,   "b": 7  }
{ "action": "divide",   "a": 100, "b": 4  }
{ "action": "today" }
```

### summarise

Text transformations on any string.

```json
{ "action": "bullets",   "text": "..." }
{ "action": "wordcount", "text": "..." }
{ "action": "uppercase", "text": "..." }
{ "action": "summary",   "text": "..." }
```

---

## AI providers

Select the provider from the dropdown before submitting a goal. You only need a key for the providers you intend to use.

| Provider | Model | Cost | Get a key |
|----------|-------|------|-----------|
| **Groq** ⭐ | `llama-3.1-8b-instant` | Free — 14 400 req/day | [console.groq.com](https://console.groq.com) |
| Gemini | `gemini-2.0-flash-lite` | Free tier available | [aistudio.google.com](https://aistudio.google.com) |
| OpenAI | `gpt-4o-mini` | Paid | [platform.openai.com](https://platform.openai.com) |
| Claude | `claude-3-5-haiku-20241022` | Paid | [console.anthropic.com](https://console.anthropic.com) |

Groq is recommended for development — it is the fastest and has a generous free quota.

---

## Project structure

```
mini-chatapp-v3/
│
├── pages/
│   └── index.vue                 # Terminal UI — the only page
│
├── composables/
│   └── useAgent.ts               # Reactive state + SSE stream consumer
│
├── server/
│   ├── api/
│   │   └── agent.post.ts         # POST /api/agent — validates, streams via SSE
│   ├── lib/
│   │   ├── llm.ts                # LLM factory, prompt templates, JSON parser
│   │   ├── nodes.ts              # Four LangGraph nodes + graph builder
│   │   └── runner.ts             # Entry point: wires LLM + graph + tools
│   └── mcp/
│       ├── calculator.ts         # Math + date tool
│       ├── filesystem.ts         # Read/write notes/*.md
│       ├── summarise.ts          # Text transformation tool
│       └── weather.ts            # Live weather via Open-Meteo
│
├── types/
│   └── agent.ts                  # Shared TypeScript types (single source of truth)
│
├── assets/css/
│   └── terminal.css              # Terminal UI styles
│
├── notes/
│   └── week.md                   # Sample notes file for testing
│
├── nuxt.config.ts
├── package.json
└── .env                          # API keys — never commit this file
```

---

## Getting started

**Prerequisites:** Node.js 18+, at least one API key (Groq is free).

```bash
# 1. Clone
git clone https://github.com/raedald-afk/Mini-ChatApp-v3.git
cd Mini-ChatApp-v3

# 2. Install
npm install

# 3. Configure (see below)
cp .env.example .env

# 4. Start
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Configuration

Add your API keys to `.env` in the project root. The values are read via Nuxt's `runtimeConfig` — never exposed to the browser.

```env
GROQ_API_KEY=your-groq-key
GEMINI_API_KEY=your-gemini-key
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

**Scripts:**

```bash
npm run dev    # Start development server
npm run build  # Build for production
npm start      # Start production server
npm test       # Run tests
```

---

## Usage

Type a goal in the terminal and press **Enter**. Press **Escape** to cancel a running goal.

**Example goals to try:**

```
what is the weather in Berlin
what is 42 multiplied by 7
what is today's date
read the file week.md
read week.md and summarise it as bullet points
read week.md and count the words
write a file called summary.md with a summary of the week
```

Each goal shows its reasoning steps live — thoughts, tool calls, and results — before the final answer appears in green.



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
