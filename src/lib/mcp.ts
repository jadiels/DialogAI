import { ApiError } from './api'
import type { ToolDefinition } from './api'

/** A remote MCP server configured in Settings (Streamable HTTP transport). */
export interface McpServerConfig {
  id: string
  name: string
  /** Full endpoint URL, e.g. https://example.com/mcp */
  url: string
  /** Extra headers, e.g. { Authorization: 'Bearer …' }. */
  headers?: Record<string, string>
}

/** A tool discovered on an MCP server. */
export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

interface JsonRpcResponse {
  id?: number | string | null
  result?: unknown
  error?: { code: number; message: string }
}

const PROTOCOL_VERSION = '2025-03-26'

/** Namespace a tool as serverId__toolName so multiple servers can't collide. */
export function namespacedToolName(serverId: string, toolName: string): string {
  return `${serverId}__${toolName}`
}

/** Split a namespaced tool name back into server id + tool name. */
export function splitToolName(namespaced: string): { serverId: string; toolName: string } | null {
  const i = namespaced.indexOf('__')
  if (i <= 0) return null
  return { serverId: namespaced.slice(0, i), toolName: namespaced.slice(i + 2) }
}

/** Convert a discovered MCP tool to the OpenAI function-tool wire shape. */
export function toToolDefinition(serverId: string, tool: McpTool): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: namespacedToolName(serverId, tool.name),
      description: tool.description,
      parameters: tool.inputSchema ?? { type: 'object', properties: {} },
    },
  }
}

/**
 * Minimal MCP client over the Streamable HTTP transport: every JSON-RPC
 * message is POSTed to the endpoint; responses arrive as application/json or
 * as a text/event-stream whose events carry JSON-RPC messages. Only remote
 * HTTP servers are reachable from the browser (stdio does not exist here),
 * and the server must allow this origin via CORS.
 */
export class McpClient {
  private nextId = 1
  private sessionId: string | null = null
  private config: McpServerConfig

  constructor(config: McpServerConfig) {
    this.config = config
  }

  /** Initialize handshake; returns server info. Call once before anything else. */
  async connect(signal?: AbortSignal): Promise<{ serverName: string }> {
    const result = (await this.request(
      'initialize',
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'DialogAI', version: '1.0' },
      },
      signal,
    )) as { serverInfo?: { name?: string } }
    // Per spec the client acknowledges before issuing other requests.
    await this.notify('notifications/initialized', signal)
    return { serverName: result?.serverInfo?.name ?? this.config.name }
  }

  async listTools(signal?: AbortSignal): Promise<McpTool[]> {
    const result = (await this.request('tools/list', {}, signal)) as {
      tools?: { name: string; description?: string; inputSchema?: Record<string, unknown> }[]
    }
    return (result?.tools ?? []).filter((t) => !!t.name)
  }

  /**
   * Invoke a tool; returns its text output (text parts joined). A tool-level
   * failure (isError) is returned as text so the model can react to it.
   */
  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    const result = (await this.request('tools/call', { name, arguments: args }, signal)) as {
      content?: { type: string; text?: string }[]
      isError?: boolean
    }
    const text = (result?.content ?? [])
      .map((c) => (c.type === 'text' && c.text ? c.text : ''))
      .filter(Boolean)
      .join('\n')
    return result?.isError ? `Error: ${text || 'tool call failed'}` : text
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      ...this.config.headers,
    }
  }

  private async notify(method: string, signal?: AbortSignal): Promise<void> {
    try {
      await fetch(this.config.url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ jsonrpc: '2.0', method }),
        signal,
      })
    } catch {
      // Notifications are fire-and-forget; some servers respond 202/404.
    }
  }

  private async request(
    method: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const id = this.nextId++
    let res: Response
    try {
      res = await fetch(this.config.url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal,
      })
    } catch (err) {
      if ((err instanceof DOMException || err instanceof Error) && err.name === 'AbortError') throw err
      throw new ApiError(
        'network',
        `Could not reach the MCP server — check the URL and that it allows this origin (CORS).`,
      )
    }
    this.sessionId = res.headers.get('Mcp-Session-Id') ?? this.sessionId
    if (!res.ok) {
      throw new ApiError('http', `MCP request failed (HTTP ${res.status}).`, res.status)
    }

    const contentType = res.headers.get('Content-Type') ?? ''
    const rpc = contentType.includes('text/event-stream')
      ? await this.readSseResponse(res, id)
      : ((await res.json()) as JsonRpcResponse)
    if (rpc.error) throw new ApiError('http', rpc.error.message)
    return rpc.result
  }

  /** Read SSE events until the JSON-RPC response for `id` arrives. */
  private async readSseResponse(res: Response, id: number): Promise<JsonRpcResponse> {
    if (!res.body) throw new ApiError('http', 'Response has no body.')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split(/\r?\n\r?\n/)
        buffer = events.pop()!
        for (const event of events) {
          for (const line of event.split(/\r?\n/)) {
            if (!line.startsWith('data:')) continue
            try {
              const msg = JSON.parse(line.slice(5).trim()) as JsonRpcResponse
              if (msg.id === id && ('result' in msg || 'error' in msg)) return msg
            } catch {
              // skip malformed event
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
    throw new ApiError('parse', 'MCP stream ended without a response.')
  }
}
