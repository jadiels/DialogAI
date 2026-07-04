# DialogAI

A local-first, ChatGPT-style web UI for any **OpenAI-compatible API** — OpenAI,
Ollama, LM Studio, vLLM, llama.cpp, OpenRouter, LiteLLM, Groq, and more.

Everything lives in your browser (IndexedDB + localStorage). No backend, no
accounts, no telemetry — the only network calls are to the API endpoints you
configure.

## Features

**Chat**
- Token-by-token **streaming** responses
- **Markdown** rendering with code syntax highlighting and copy buttons
- **Reasoning / "thinking"** shown in a collapsible section (supports both the
  `reasoning`/`reasoning_content` field and inline `<think>…</think>` tags)
- **Per-response metrics** (ⓘ): time-to-first-token, tokens/s, token usage,
  reasoning tokens, and native Ollama timings when the server reports them
- **Branching** — edit a sent message or regenerate a reply to fork the
  conversation, and switch between branches with `< 2/2 >` navigation
- Auto-generated chat titles (using the chat's own model, so no extra model is
  loaded), or regenerate on demand with a configurable global model

**Connections**
- Use **multiple connections at once**; enable/disable each with a switch
- **Drag to reorder** — the order drives how models are grouped in the picker
- Live **online/offline** status per connection
- Model lists fetched from `GET /v1/models`, with search, **pin-to-top**, manual
  entry, and **Ollama model pull** (`/api/pull`) with progress

**Agents**
- Reusable personas (name + system prompt + default model)
- Grid with drag-and-drop ordering and a per-card menu
- **Pin to menu** to launch an agent chat straight from the sidebar
- Start a chat from an agent and optionally override its model/connection

**Images**
- Generate images via `/v1/images/generations` (DALL·E, gpt-image-1, …)
- Persistent **album** with a viewer showing the prompt, model, size and date,
  plus download and delete

**Other**
- Full-text **search** across chat titles and message content
- **Storage usage** breakdown by category, with per-category clear
- Responsive layout with a collapsible sidebar (desktop) / drawer (mobile)

## Getting started

```bash
npm install
npm run dev
```

Open the app, go to **Settings → Connections → Add**, and configure a provider:

| Provider        | Base URL                   | API key      |
| --------------- | -------------------------- | ------------ |
| Ollama (local)  | `http://localhost:11434`   | leave empty  |
| LM Studio       | `http://localhost:1234`    | leave empty  |
| OpenAI          | `https://api.openai.com`   | your API key |
| OpenRouter      | `https://openrouter.ai/api`| your API key |

The base URL may be pasted with or without a trailing `/v1`.

### Notes

- **CORS**: because the app runs entirely in the browser, the server must allow
  the app's origin. Localhost usually works out of the box; for a remote Ollama,
  run it with `OLLAMA_ORIGINS='*' ollama serve`. Providers that don't send CORS
  headers (e.g. OpenAI's public API called directly) are best used through a
  CORS-friendly proxy such as LiteLLM.
- **API keys** are stored in your browser and sent straight from the client to
  the endpoint — appropriate for local/personal use.
- **Model types** (chat vs. image vs. embedding) are guessed from the model name,
  since `/v1/models` doesn't report a type. You can always type a model manually.

## Scripts

| Command         | Description                              |
| --------------- | ---------------------------------------- |
| `npm run dev`   | Start the Vite dev server                |
| `npm run build` | Type-check and build for production      |
| `npm run preview` | Preview the production build           |
| `npm test`      | Run unit tests (message tree, SSE, storage) |

## Contributing

Contributions are welcome! DialogAI accepts changes **only through forks and
pull requests** — fork the repo, branch off `DialogAI`, and open a PR. See
[CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow, and use the issue
templates to [report a bug](../../issues/new?template=bug_report.yml) or
[request a feature](../../issues/new?template=feature_request.yml).

## Keyboard shortcuts

- `Ctrl/Cmd + K` — search
- `Ctrl/Cmd + Shift + O` — new chat
- `Enter` — send · `Shift + Enter` — new line

## Tech stack

React 19 · Vite · TypeScript · Tailwind CSS v4 · Zustand · React Router ·
`idb` (IndexedDB) · react-markdown + highlight.js · dnd-kit.

All data is stored locally: chats, agents and generated images in **IndexedDB**,
settings in **localStorage**.
