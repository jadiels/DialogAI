export interface ConnectionProfile {
  id: string
  name: string
  /** Normalized: no trailing slash, no /v1 suffix. */
  baseUrl: string
  /** May be empty — Ollama ignores it. */
  apiKey: string
  defaultModel: string
  /** Cache of the last successful GET /v1/models. */
  models: string[]
  modelsFetchedAt?: number
  /** Model ids pinned to the top of the selector, in pin order. */
  pinnedModels?: string[]
}

/**
 * Optional generation controls sent to /v1/chat/completions. Every field is
 * optional: an unset field is omitted from the request so the server applies
 * its own default. Resolved global → agent → chat by `resolveSampling`.
 */
export interface SamplingParams {
  temperature?: number
  top_p?: number
  max_tokens?: number
  presence_penalty?: number
  frequency_penalty?: number
  seed?: number
}

export interface Settings {
  version: 1
  /** Ordered — this order drives the connection order in the model selector. */
  profiles: ConnectionProfile[]
  /** Connections currently in use; their models all populate the selector. */
  enabledProfileIds: string[]
  /** Global default model used for utility tasks like generating chat titles. */
  titleModel?: string
  /** Default model for the image generation page. */
  imageModel?: string
  /** Global default sampling params; agents and chats override per-field. */
  sampling?: SamplingParams
  ui: { sidebarCollapsed: boolean; theme?: Theme }
}

export type Theme = 'dark' | 'light' | 'auto' | 'nebula'

export interface Agent {
  id: string
  name: string
  systemPrompt: string
  /** Empty string means "use the active profile's default model". */
  defaultModel: string
  /** Per-agent sampling override; merged over the global defaults. */
  sampling?: SamplingParams
  sortOrder: number
  createdAt: number
  /** Pinned agents are shown directly in the sidebar under "Agents". */
  pinned?: boolean
}

export interface GeneratedImage {
  id: string
  /** Data URI (base64) or URL. */
  src: string
  prompt: string
  model: string
  size: string
  connectionName?: string
  createdAt: number
}

export type Role = 'system' | 'user' | 'assistant'

export interface UsageDetails {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  reasoning_tokens?: number
  accepted_prediction_tokens?: number
  rejected_prediction_tokens?: number
}

/** Native timing fields (nanoseconds) some Ollama responses include. */
export interface OllamaTimings {
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

export interface MessageMetrics {
  /** Time to first token, in milliseconds. */
  ttftMs: number
  /** Total request duration, in milliseconds. */
  totalMs: number
  /** Completion tokens (server-reported, or approximated from stream chunks). */
  tokens: number
  /** Decode throughput: tokens / generation time (excludes TTFT). */
  tokensPerSecond: number
  /** True when `tokens` was approximated from chunk count (no server usage). */
  approx: boolean
  /** Raw token usage reported by the server, when available. */
  usage?: UsageDetails
  /** Native Ollama timings, when the server includes them. */
  timings?: OllamaTimings
}

export interface MessageNode {
  id: string
  /** null only for the synthetic root. */
  parentId: string | null
  /** Ordered — determines sibling indices in the "< 2/2 >" navigation. */
  childrenIds: string[]
  role: Role
  content: string
  /** Reasoning / "thinking" trace, kept separate from the answer content. */
  reasoning?: string
  /** For assistant messages: which model produced it. */
  model?: string
  createdAt: number
  status?: 'streaming' | 'error' | 'done'
  error?: string
  /** Streaming performance metrics (assistant messages). */
  metrics?: MessageMetrics
}

export interface Chat {
  id: string
  title: string
  /** Display only — the system prompt is snapshotted into the root node. */
  agentId?: string
  agentName?: string
  /** Model used for the next send; user can switch mid-chat. */
  model: string
  /** Per-chat sampling override; merged over agent and global defaults. */
  sampling?: SamplingParams
  /** Connection this chat talks to (falls back to the first enabled one). */
  profileId?: string
  /** Synthetic root: role 'system' (agent prompt or empty content). */
  rootId: string
  /** Determines the visible path (root → leaf). */
  currentLeafId: string
  nodes: Record<string, MessageNode>
  createdAt: number
  updatedAt: number
}
