import { afterEach, describe, expect, it, vi } from 'vitest'
import { newStreamStats, streamChat, type StreamDelta } from './api'

/** Build a Response whose body streams the given SSE events. */
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

function chunk(delta: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  return `data: ${JSON.stringify({ choices: [{ delta, ...extra }], ...extra })}\n\n`
}

async function run(events: string[], sampling?: Record<string, number>) {
  const fetchMock = vi.fn().mockResolvedValue(sseResponse(events))
  vi.stubGlobal('fetch', fetchMock)
  const deltas: StreamDelta[] = []
  const stats = newStreamStats()
  const result = await streamChat(
    {
      baseUrl: 'http://test',
      apiKey: 'k',
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      sampling,
    },
    (d) => deltas.push(d),
    new AbortController().signal,
    stats,
  )
  const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
  return { deltas, stats, result, body }
}

afterEach(() => vi.unstubAllGlobals())

describe('streamChat request body', () => {
  it('spreads defined sampling fields and omits everything unset', async () => {
    const { body } = await run(['data: [DONE]\n\n'], { temperature: 0.7, seed: 42 })
    expect(body.temperature).toBe(0.7)
    expect(body.seed).toBe(42)
    expect('top_p' in body).toBe(false)
    expect('max_tokens' in body).toBe(false)
    expect(body.stream).toBe(true)
  })

  it('sends no sampling fields when none are set', async () => {
    const { body } = await run(['data: [DONE]\n\n'])
    for (const k of ['temperature', 'top_p', 'max_tokens', 'presence_penalty', 'seed']) {
      expect(k in body).toBe(false)
    }
  })
})

describe('streamChat SSE parsing', () => {
  it('emits content deltas and finish reason', async () => {
    const { deltas, result } = await run([
      chunk({ content: 'Hel' }),
      chunk({ content: 'lo' }, { finish_reason: 'stop' }),
      'data: [DONE]\n\n',
    ])
    expect(deltas.map((d) => d.content).join('')).toBe('Hello')
    expect(result.finishReason).toBe('stop')
  })

  it('splits inline <think> tags into reasoning, across chunk boundaries', async () => {
    const { deltas } = await run([
      chunk({ content: '<th' }),
      chunk({ content: 'ink>plan</think>answer' }),
      'data: [DONE]\n\n',
    ])
    const reasoning = deltas.map((d) => d.reasoning ?? '').join('')
    const content = deltas.map((d) => d.content ?? '').join('')
    expect(reasoning).toBe('plan')
    expect(content).toBe('answer')
  })

  it('surfaces the dedicated reasoning field', async () => {
    const { deltas } = await run([
      chunk({ reasoning_content: 'thinking…' }),
      chunk({ content: 'done' }),
      'data: [DONE]\n\n',
    ])
    expect(deltas.some((d) => d.reasoning === 'thinking…')).toBe(true)
  })

  it('captures usage from the final chunk', async () => {
    const { stats } = await run([
      chunk({ content: 'x' }),
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 } })}\n\n`,
      'data: [DONE]\n\n',
    ])
    expect(stats.completionTokens).toBe(7)
    expect(stats.usage?.total_tokens).toBe(12)
  })

  it('skips malformed events and keeps streaming', async () => {
    const { deltas } = await run([
      'data: {not json\n\n',
      chunk({ content: 'ok' }),
      'data: [DONE]\n\n',
    ])
    expect(deltas.map((d) => d.content ?? '').join('')).toBe('ok')
  })
})
