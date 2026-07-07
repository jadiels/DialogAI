import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpClient, namespacedToolName, splitToolName, toToolDefinition } from './mcp'

function jsonResponse(rpc: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(rpc), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function sseResponse(events: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(e))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

afterEach(() => vi.unstubAllGlobals())

describe('tool name namespacing', () => {
  it('round-trips serverId and toolName', () => {
    const namespaced = namespacedToolName('srv1', 'search')
    expect(namespaced).toBe('srv1__search')
    expect(splitToolName(namespaced)).toEqual({ serverId: 'srv1', toolName: 'search' })
  })

  it('returns null for names without a namespace', () => {
    expect(splitToolName('plain')).toBeNull()
  })

  it('converts an MCP tool to the OpenAI wire shape', () => {
    const schema = { type: 'object', properties: { q: { type: 'string' } } }
    expect(toToolDefinition('srv1', { name: 'search', description: 'Find', inputSchema: schema })).toEqual({
      type: 'function',
      function: { name: 'srv1__search', description: 'Find', parameters: schema },
    })
  })
})

describe('McpClient', () => {
  const config = { id: 'srv1', name: 'Test', url: 'http://mcp.test/mcp' }

  it('handshakes, tracks the session id, and lists tools', async () => {
    const fetchMock = vi
      .fn()
      // initialize
      .mockResolvedValueOnce(
        jsonResponse(
          { jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'srv' } } },
          { 'Mcp-Session-Id': 'sess-42' },
        ),
      )
      // notifications/initialized
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      // tools/list
      .mockResolvedValueOnce(
        jsonResponse({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'search' }] } }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const client = new McpClient(config)
    const { serverName } = await client.connect()
    expect(serverName).toBe('srv')
    const tools = await client.listTools()
    expect(tools).toEqual([{ name: 'search' }])
    // Subsequent requests carry the session header back.
    const headers = fetchMock.mock.calls[2][1].headers as Record<string, string>
    expect(headers['Mcp-Session-Id']).toBe('sess-42')
  })

  it('reads a JSON-RPC response delivered over SSE', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      sseResponse([
        'data: {"jsonrpc":"2.0","method":"notifications/progress"}\n\n',
        'data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"hi"}]}}\n\n',
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = new McpClient(config)
    const text = await client.callTool('echo', {})
    expect(text).toBe('hi')
  })

  it('surfaces tool-level failures as error text', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: 'boom' }], isError: true },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = new McpClient(config)
    expect(await client.callTool('explode', {})).toBe('Error: boom')
  })

  it('throws on JSON-RPC errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'no such tool' } }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const client = new McpClient(config)
    await expect(client.callTool('missing', {})).rejects.toThrow('no such tool')
  })
})
