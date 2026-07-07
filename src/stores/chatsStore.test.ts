import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolCall } from '../lib/types'

// Node has no rAF; make flush() synchronous for the store's streaming buffer.
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  cb(0)
  return 1
})
vi.stubGlobal('cancelAnimationFrame', () => {})

const callTool = vi.fn()
vi.mock('./mcpStore', () => ({
  toolDefinitionsFor: () => [],
  useMcpStore: { getState: () => ({ callTool }) },
}))

const streamChat = vi.fn()
vi.mock('../lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, streamChat: (...args: unknown[]) => streamChat(...args) }
})

import { useChatsStore } from './chatsStore'
import { useSettingsStore } from './settingsStore'
import { resolvePath } from '../lib/messageTree'

/** streamChat stub: emit `content`, then finish with the given tool calls. */
function turn(content: string, toolCalls: ToolCall[] = []) {
  return async (
    _req: unknown,
    onDelta: (d: { content?: string }) => void,
    _signal: AbortSignal,
    stats: { firstTokenAt?: number; endedAt?: number; chunks: number },
  ) => {
    if (content) {
      stats.firstTokenAt = 1
      stats.chunks = 1
      onDelta({ content })
    }
    stats.endedAt = 2
    return { finishReason: toolCalls.length ? 'tool_calls' : 'stop', toolCalls }
  }
}

beforeEach(() => {
  useSettingsStore
    .getState()
    .saveProfile({ name: 'test', baseUrl: 'http://x', apiKey: '', defaultModel: 'm' })
})

afterEach(() => {
  streamChat.mockReset()
  callTool.mockReset()
  useSettingsStore.getState().reset()
})

describe('tool-calling loop', () => {
  it('executes requested tools and loops until a normal finish', async () => {
    streamChat
      .mockImplementationOnce(
        turn('', [{ id: 'c1', name: 'srv__add', arguments: '{"a":1,"b":2}' }]),
      )
      .mockImplementationOnce(turn('The answer is 3.'))
    callTool.mockResolvedValue('3')

    const chatId = await useChatsStore.getState().startChat('add 1+2')
    expect(chatId).toBeTruthy()
    // startChat fires sendMessage without awaiting; wait for the loop to finish.
    await vi.waitFor(() => {
      expect(streamChat).toHaveBeenCalledTimes(2)
    })

    expect(callTool).toHaveBeenCalledWith('srv__add', { a: 1, b: 2 }, expect.anything())

    const chat = useChatsStore.getState().chats[chatId!]
    const roles = resolvePath(chat).map((n) => n.role)
    expect(roles).toEqual(['system', 'user', 'assistant', 'tool', 'assistant'])

    const path = resolvePath(chat)
    expect(path[2].toolCalls).toEqual([{ id: 'c1', name: 'srv__add', arguments: '{"a":1,"b":2}' }])
    expect(path[3].content).toBe('3')
    expect(path[3].toolCallId).toBe('c1')
    expect(path[4].content).toBe('The answer is 3.')
    expect(path[4].status).toBe('done')
  })

  it('feeds tool failures back to the model instead of erroring the chat', async () => {
    streamChat
      .mockImplementationOnce(turn('', [{ id: 'c1', name: 'srv__x', arguments: '{}' }]))
      .mockImplementationOnce(turn('Could not run the tool.'))
    callTool.mockRejectedValue(new Error('server unreachable'))

    const chatId = await useChatsStore.getState().startChat('do it')
    await vi.waitFor(() => {
      expect(streamChat).toHaveBeenCalledTimes(2)
    })

    const path = resolvePath(useChatsStore.getState().chats[chatId!])
    const toolNode = path.find((n) => n.role === 'tool')
    expect(toolNode?.content).toContain('server unreachable')
    expect(path[path.length - 1].status).toBe('done')
  })

  it('plain completions still work with no tools involved', async () => {
    streamChat.mockImplementationOnce(turn('hello!'))

    const chatId = await useChatsStore.getState().startChat('hi')
    await vi.waitFor(() => {
      expect(streamChat).toHaveBeenCalledTimes(1)
    })

    const path = resolvePath(useChatsStore.getState().chats[chatId!])
    expect(path.map((n) => n.role)).toEqual(['system', 'user', 'assistant'])
    expect(path[2].content).toBe('hello!')
    expect(callTool).not.toHaveBeenCalled()
  })
})
