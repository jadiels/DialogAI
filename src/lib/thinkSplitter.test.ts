import { describe, expect, it } from 'vitest'
import { createThinkSplitter, type StreamDelta } from './api'

/** Feed a sequence of chunks and concatenate the resulting content/reasoning. */
function run(chunks: string[]): { content: string; reasoning: string } {
  const s = createThinkSplitter()
  let content = ''
  let reasoning = ''
  const take = (d: StreamDelta) => {
    content += d.content ?? ''
    reasoning += d.reasoning ?? ''
  }
  for (const c of chunks) take(s.feed(c))
  take(s.flush())
  return { content, reasoning }
}

describe('createThinkSplitter', () => {
  it('passes through content with no think tags', () => {
    expect(run(['Hello ', 'world'])).toEqual({ content: 'Hello world', reasoning: '' })
  })

  it('separates a single think block', () => {
    expect(run(['<think>reasoning here</think>the answer'])).toEqual({
      content: 'the answer',
      reasoning: 'reasoning here',
    })
  })

  it('handles the open tag split across chunks', () => {
    expect(run(['<thi', 'nk>secret</think>answer'])).toEqual({
      content: 'answer',
      reasoning: 'secret',
    })
  })

  it('handles the close tag split across chunks', () => {
    expect(run(['<think>abc</thi', 'nk>done'])).toEqual({
      content: 'done',
      reasoning: 'abc',
    })
  })

  it('streams reasoning token-by-token then the answer', () => {
    expect(run(['<think>', 'a', 'b', 'c', '</think>', 'X', 'Y'])).toEqual({
      content: 'XY',
      reasoning: 'abc',
    })
  })

  it('does not mistake a lone < in the answer for a tag (flushes at end)', () => {
    expect(run(['a < b'])).toEqual({ content: 'a < b', reasoning: '' })
  })

  it('keeps real markup like <div> in the content', () => {
    expect(run(['use <div> here'])).toEqual({ content: 'use <div> here', reasoning: '' })
  })

  it('treats an unclosed think block as reasoning', () => {
    expect(run(['<think>still thinking'])).toEqual({ content: '', reasoning: 'still thinking' })
  })
})
