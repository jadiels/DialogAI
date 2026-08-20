import { describe, expect, it } from 'vitest'
import { extractNodeToolCalls, extractToolCallText } from './toolCallText'

const BLOCK = '<tool_call>\n{"name": "check_availability", "arguments": {"date": "2026-08-21"}}\n</tool_call>'

describe('extractToolCallText', () => {
  it('parses a tool_call block and strips it from the text', () => {
    const { text, calls } = extractToolCallText(`Vou verificar.\n${BLOCK}`)
    expect(text).toBe('Vou verificar.')
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('check_availability')
    expect(JSON.parse(calls[0].arguments)).toEqual({ date: '2026-08-21' })
    expect(calls[0].id).toBeTruthy()
  })

  it('parses multiple blocks in order', () => {
    const two = `${BLOCK}\n<tool_call>{"name": "end_call", "arguments": {}}</tool_call>`
    const { text, calls } = extractToolCallText(two)
    expect(text).toBe('')
    expect(calls.map((c) => c.name)).toEqual(['check_availability', 'end_call'])
  })

  it('keeps string arguments as-is and defaults missing arguments to {}', () => {
    const { calls } = extractToolCallText(
      '<tool_call>{"name": "a", "arguments": "{\\"x\\":1}"}</tool_call><tool_call>{"name": "b"}</tool_call>',
    )
    expect(calls[0].arguments).toBe('{"x":1}')
    expect(calls[1].arguments).toBe('{}')
  })

  it('leaves malformed or nameless blocks untouched', () => {
    const bad = '<tool_call>not json</tool_call> e <tool_call>{"arguments": {}}</tool_call>'
    const { text, calls } = extractToolCallText(bad)
    expect(text).toBe(bad)
    expect(calls).toHaveLength(0)
  })
})

describe('extractNodeToolCalls', () => {
  it('extracts from reasoning (unterminated think case) and clears it', () => {
    const result = extractNodeToolCalls('', BLOCK)
    expect(result).not.toBeNull()
    expect(result!.reasoning).toBeUndefined()
    expect(result!.content).toBe('')
    expect(result!.calls[0].name).toBe('check_availability')
  })

  it('orders reasoning calls before content calls', () => {
    const result = extractNodeToolCalls(
      '<tool_call>{"name": "second", "arguments": {}}</tool_call>',
      '<tool_call>{"name": "first", "arguments": {}}</tool_call>',
    )
    expect(result!.calls.map((c) => c.name)).toEqual(['first', 'second'])
  })

  it('returns null when there is nothing to extract', () => {
    expect(extractNodeToolCalls('plain answer', 'some thinking')).toBeNull()
  })
})
