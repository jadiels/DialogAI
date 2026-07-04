import type { MessageMetrics, OllamaTimings, Role, UsageDetails } from './types'

export type ApiErrorKind = 'network' | 'auth' | 'http' | 'parse'

export class ApiError extends Error {
  kind: ApiErrorKind
  status?: number

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

export function isAbortError(err: unknown): boolean {
  // Native fetch throws a DOMException, but some polyfills/shims throw a plain Error.
  return (err instanceof DOMException || err instanceof Error) && err.name === 'AbortError'
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return err instanceof Error ? err.message : String(err)
}

/** Accepts URLs pasted with or without a trailing slash or /v1 suffix. */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '')
  if (url.toLowerCase().endsWith('/v1')) url = url.slice(0, -3).replace(/\/+$/, '')
  return url
}

function authHeaders(apiKey: string): Record<string, string> {
  // Ollama ignores the key but some proxies require the header to be present.
  return { Authorization: `Bearer ${apiKey || 'none'}` }
}

async function toApiError(res: Response): Promise<ApiError> {
  let detail = ''
  try {
    const body = await res.json()
    detail = body?.error?.message ?? body?.error ?? ''
  } catch {
    // non-JSON error body
  }
  if (res.status === 401 || res.status === 403) {
    return new ApiError('auth', detail || 'Unauthorized — check your API key.', res.status)
  }
  return new ApiError('http', detail || `Request failed (HTTP ${res.status}).`, res.status)
}

function networkError(): ApiError {
  return new ApiError(
    'network',
    'Could not reach the server — check the base URL. For remote Ollama, also check CORS (OLLAMA_ORIGINS).',
  )
}

export async function fetchModels(p: { baseUrl: string; apiKey: string }): Promise<string[]> {
  let res: Response
  try {
    res = await fetch(`${p.baseUrl}/v1/models`, { headers: authHeaders(p.apiKey) })
  } catch {
    throw networkError()
  }
  if (!res.ok) throw await toApiError(res)
  try {
    const json = await res.json()
    const ids = (json.data as { id?: string }[]).map((m) => m.id).filter((id): id is string => !!id)
    return [...new Set(ids)].sort()
  } catch {
    throw new ApiError('parse', 'Unexpected response from /v1/models.')
  }
}

/**
 * Reachability check: any HTTP response (even 401/404) means the server is
 * online; a network error / timeout / bad URL means offline.
 */
export async function pingProfile(
  p: { baseUrl: string; apiKey: string },
  timeoutMs = 6000,
): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await fetch(`${p.baseUrl}/v1/models`, {
      headers: authHeaders(p.apiKey),
      signal: controller.signal,
    })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export interface ChatRequest {
  baseUrl: string
  apiKey: string
  model: string
  messages: { role: Role; content: string }[]
}

export interface StreamDelta {
  content?: string
  reasoning?: string
}

const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>'

/** Longest suffix of `s` that is a (partial) prefix of `tag`, so split tags are held back. */
function partialTagHold(s: string, tag: string): number {
  for (let n = Math.min(s.length, tag.length - 1); n > 0; n--) {
    if (tag.startsWith(s.slice(s.length - n))) return n
  }
  return 0
}

/**
 * Splits a streamed content string into answer vs. reasoning by tracking
 * `<think>…</think>` tags across chunk boundaries (tags may arrive split).
 * Exported for testing.
 */
export function createThinkSplitter() {
  let inThink = false
  let carry = ''
  return {
    feed(text: string): StreamDelta {
      let s = carry + text
      carry = ''
      let content = ''
      let reasoning = ''
      for (;;) {
        if (!inThink) {
          const i = s.indexOf(THINK_OPEN)
          if (i === -1) {
            const hold = partialTagHold(s, THINK_OPEN)
            content += s.slice(0, s.length - hold)
            carry = s.slice(s.length - hold)
            break
          }
          content += s.slice(0, i)
          s = s.slice(i + THINK_OPEN.length)
          inThink = true
        } else {
          const i = s.indexOf(THINK_CLOSE)
          if (i === -1) {
            const hold = partialTagHold(s, THINK_CLOSE)
            reasoning += s.slice(0, s.length - hold)
            carry = s.slice(s.length - hold)
            break
          }
          reasoning += s.slice(0, i)
          s = s.slice(i + THINK_CLOSE.length)
          inThink = false
        }
      }
      return { content, reasoning }
    },
    flush(): StreamDelta {
      const rest = carry
      carry = ''
      return inThink ? { reasoning: rest } : { content: rest }
    },
  }
}

export interface ImageRequest {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  size: string
  n: number
}

/**
 * Generate images via the OpenAI-compatible /v1/images/generations endpoint.
 * Returns displayable sources (data: URIs for b64_json, or plain URLs).
 */
export async function generateImage(req: ImageRequest, signal: AbortSignal): Promise<string[]> {
  const attempt = async (includeFormat: boolean): Promise<string[]> => {
    const body: Record<string, unknown> = {
      model: req.model,
      prompt: req.prompt,
      n: req.n,
      size: req.size,
    }
    // dall-e accepts response_format; gpt-image-1 rejects it (returns b64 anyway).
    if (includeFormat) body.response_format = 'b64_json'
    let res: Response
    try {
      res = await fetch(`${req.baseUrl}/v1/images/generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(req.apiKey) },
        body: JSON.stringify(body),
        signal,
      })
    } catch (err) {
      if (isAbortError(err)) throw err
      throw networkError()
    }
    if (!res.ok) throw await toApiError(res)
    try {
      const json = await res.json()
      const data = (json.data ?? []) as { b64_json?: string; url?: string }[]
      return data
        .map((d) => (d.b64_json ? `data:image/png;base64,${d.b64_json}` : d.url))
        .filter((s): s is string => !!s)
    } catch {
      throw new ApiError('parse', 'Unexpected response from /v1/images/generations.')
    }
  }

  try {
    return await attempt(true)
  } catch (err) {
    // Retry without response_format when the model doesn't support it.
    if (err instanceof ApiError && err.kind === 'http' && /response_format/i.test(err.message)) {
      return attempt(false)
    }
    throw err
  }
}

export interface PullProgress {
  status: string
  completed?: number
  total?: number
}

/**
 * Pulls a model via Ollama's native streaming endpoint ({baseUrl}/api/pull).
 * Reports NDJSON progress lines. Throws ApiError (e.g. on non-Ollama servers
 * that don't expose /api/pull) and rethrows AbortError when `signal` fires.
 */
export async function pullModel(
  baseUrl: string,
  apiKey: string,
  name: string,
  onProgress: (p: PullProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(apiKey) },
      body: JSON.stringify({ name, stream: true }),
      signal,
    })
  } catch (err) {
    if (isAbortError(err)) throw err
    throw networkError()
  }
  if (!res.ok) throw await toApiError(res)
  if (!res.body) throw new ApiError('http', 'Response has no body.')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let json: { status?: string; error?: string; completed?: number; total?: number }
      try {
        json = JSON.parse(trimmed)
      } catch {
        continue
      }
      if (json.error) throw new ApiError('http', json.error)
      onProgress({ status: json.status ?? '', completed: json.completed, total: json.total })
    }
  }
}

/**
 * Timing/token accumulator filled in during streaming. The caller creates it
 * and reads it back afterwards (even on abort) to compute metrics.
 */
export interface StreamStats {
  startedAt: number
  firstTokenAt?: number
  endedAt?: number
  /** Content deltas received — a proxy for token count when usage is absent. */
  chunks: number
  /** Server-reported completion tokens, if the endpoint returns usage. */
  completionTokens?: number
  usage?: UsageDetails
  timings?: OllamaTimings
}

export function newStreamStats(): StreamStats {
  return { startedAt: performance.now(), chunks: 0 }
}

export function computeMetrics(stats: StreamStats): MessageMetrics | undefined {
  if (stats.firstTokenAt === undefined || stats.endedAt === undefined) return undefined
  const tokens = stats.completionTokens ?? stats.chunks
  if (tokens <= 0) return undefined
  const genMs = Math.max(1, stats.endedAt - stats.firstTokenAt)
  return {
    ttftMs: stats.firstTokenAt - stats.startedAt,
    totalMs: stats.endedAt - stats.startedAt,
    tokens,
    tokensPerSecond: (tokens / genMs) * 1000,
    approx: stats.completionTokens === undefined,
    usage: stats.usage,
    timings: stats.timings,
  }
}

/** Extract token usage + native timings from a streamed chunk, if present. */
function captureStats(json: Record<string, unknown>, stats: StreamStats): void {
  const usage = json.usage as
    | (UsageDetails & { completion_tokens_details?: UsageDetails })
    | undefined
  if (usage) {
    if (typeof usage.completion_tokens === 'number') stats.completionTokens = usage.completion_tokens
    const details = usage.completion_tokens_details
    stats.usage = {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      reasoning_tokens: details?.reasoning_tokens,
      accepted_prediction_tokens: details?.accepted_prediction_tokens,
      rejected_prediction_tokens: details?.rejected_prediction_tokens,
    }
  }
  const num = (k: string) => (typeof json[k] === 'number' ? (json[k] as number) : undefined)
  const timings: OllamaTimings = {
    total_duration: num('total_duration'),
    load_duration: num('load_duration'),
    prompt_eval_count: num('prompt_eval_count'),
    prompt_eval_duration: num('prompt_eval_duration'),
    eval_count: num('eval_count'),
    eval_duration: num('eval_duration'),
  }
  if (Object.values(timings).some((v) => v !== undefined)) {
    stats.timings = { ...stats.timings, ...timings }
  }
}

/**
 * Streams a chat completion, invoking onDelta for each content/reasoning delta
 * and filling `stats` with timing/token data. Reasoning is surfaced both from a
 * dedicated `reasoning`/`reasoning_content` field and from inline `<think>`
 * tags. Throws ApiError on failure and rethrows AbortError when `signal` fires.
 */
export async function streamChat(
  req: ChatRequest,
  onDelta: (delta: StreamDelta) => void,
  signal: AbortSignal,
  stats: StreamStats,
): Promise<{ finishReason: string | null }> {
  let res: Response
  try {
    res = await fetch(`${req.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(req.apiKey) },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        stream: true,
        // Ask for token usage in a final chunk; servers that don't support it
        // simply ignore the field and we fall back to counting chunks.
        stream_options: { include_usage: true },
      }),
      signal,
    })
  } catch (err) {
    if (isAbortError(err)) throw err
    throw networkError()
  }
  if (!res.ok) throw await toApiError(res)
  if (!res.body) throw new ApiError('http', 'Response has no body.')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const splitter = createThinkSplitter()
  let buffer = ''
  let finishReason: string | null = null

  const emit = (d: StreamDelta) => {
    if (!d.content && !d.reasoning) return
    stats.firstTokenAt ??= performance.now()
    onDelta(d)
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE events are separated by a blank line; chunks may split mid-line, so
      // keep the incomplete tail in the buffer. Accept both LF and CRLF framing.
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop()!
      for (const event of events) {
        for (const line of event.split(/\r?\n/)) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') {
            emit(splitter.flush())
            return { finishReason }
          }
          try {
            const json = JSON.parse(data)
            const choiceDelta = json.choices?.[0]?.delta
            let carried = false
            // Dedicated reasoning field (DeepSeek, Ollama, OpenRouter…).
            const reasoning = choiceDelta?.reasoning_content ?? choiceDelta?.reasoning
            if (typeof reasoning === 'string' && reasoning) {
              emit({ reasoning })
              carried = true
            }
            // Content may embed <think>…</think>, split by the parser.
            const content = choiceDelta?.content
            if (typeof content === 'string' && content) {
              emit(splitter.feed(content))
              carried = true
            }
            if (carried) stats.chunks += 1
            finishReason = json.choices?.[0]?.finish_reason ?? finishReason
            captureStats(json, stats)
          } catch {
            // skip malformed event
          }
        }
      }
    }
    emit(splitter.flush())
  } finally {
    stats.endedAt = performance.now()
  }
  return { finishReason }
}

/**
 * One-shot completion that collects the streamed content into a single string
 * (reasoning is dropped). Used for utility calls like title generation.
 */
export async function complete(req: ChatRequest, signal: AbortSignal): Promise<string> {
  const stats = newStreamStats()
  let text = ''
  await streamChat(req, (d) => { if (d.content) text += d.content }, signal, stats)
  return text.trim()
}
