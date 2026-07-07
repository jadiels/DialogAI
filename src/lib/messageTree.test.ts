import { describe, expect, it } from 'vitest'
import {
  addSibling,
  appendNode,
  createChat,
  deepestDescendant,
  navigateSibling,
  pathToApiMessages,
  resolvePath,
  siblingInfo,
  type NewNode,
} from './messageTree'
import type { Chat } from './types'

let counter = 0
function node(role: NewNode['role'], content: string): NewNode {
  counter += 1
  return { id: `n${counter}`, role, content, createdAt: counter }
}

function baseChat(systemPrompt = ''): Chat {
  counter += 1
  return createChat({
    id: `chat${counter}`,
    rootId: `root${counter}`,
    model: 'test-model',
    systemPrompt,
    createdAt: counter,
  })
}

describe('appendNode / resolvePath', () => {
  it('builds a linear conversation from root to leaf', () => {
    let chat = baseChat()
    const u1 = node('user', 'hello')
    const a1 = node('assistant', 'hi!')
    chat = appendNode(chat, u1)
    chat = appendNode(chat, a1)

    const path = resolvePath(chat)
    expect(path.map((n) => n.id)).toEqual([chat.rootId, u1.id, a1.id])
    expect(chat.currentLeafId).toBe(a1.id)
  })
})

describe('addSibling (edit / regenerate)', () => {
  it('creates a sibling branch and preserves the old one', () => {
    let chat = baseChat()
    const u1 = node('user', 'original question')
    const a1 = node('assistant', 'original answer')
    chat = appendNode(chat, u1)
    chat = appendNode(chat, a1)

    const u1edit = node('user', 'edited question')
    chat = addSibling(chat, u1.id, u1edit)

    expect(chat.currentLeafId).toBe(u1edit.id)
    expect(siblingInfo(chat, u1edit.id)).toEqual({ index: 1, count: 2 })
    expect(siblingInfo(chat, u1.id)).toEqual({ index: 0, count: 2 })
    // old branch is intact
    expect(chat.nodes[u1.id].childrenIds).toEqual([a1.id])
    // visible path shows only the new branch
    expect(resolvePath(chat).map((n) => n.id)).toEqual([chat.rootId, u1edit.id])
  })

  it('throws when trying to branch from the root', () => {
    const chat = baseChat()
    expect(() => addSibling(chat, chat.rootId, node('user', 'x'))).toThrow()
  })
})

describe('navigateSibling', () => {
  it('switches branches and restores the downstream conversation', () => {
    let chat = baseChat()
    const u1 = node('user', 'q1')
    const a1 = node('assistant', 'answer 1')
    const u2 = node('user', 'follow-up')
    const a2 = node('assistant', 'answer 2')
    chat = appendNode(chat, u1)
    chat = appendNode(chat, a1)
    chat = appendNode(chat, u2)
    chat = appendNode(chat, a2)

    // edit u1 → new branch with its own reply
    const u1edit = node('user', 'q1 edited')
    const a1edit = node('assistant', 'edited answer')
    chat = addSibling(chat, u1.id, u1edit)
    chat = appendNode(chat, a1edit)

    // navigate back to the original branch: full downstream reappears
    chat = navigateSibling(chat, u1edit.id, -1)
    expect(resolvePath(chat).map((n) => n.id)).toEqual([chat.rootId, u1.id, a1.id, u2.id, a2.id])

    // and forward again to the edited branch
    chat = navigateSibling(chat, u1.id, 1)
    expect(resolvePath(chat).map((n) => n.id)).toEqual([chat.rootId, u1edit.id, a1edit.id])
  })

  it('clamps at the ends', () => {
    let chat = baseChat()
    const u1 = node('user', 'q')
    chat = appendNode(chat, u1)
    chat = addSibling(chat, u1.id, node('user', 'q v2'))
    const before = chat.currentLeafId
    chat = navigateSibling(chat, chat.currentLeafId, 1)
    expect(chat.currentLeafId).toBe(before)
  })
})

describe('deepestDescendant', () => {
  it('follows the last child at each level', () => {
    let chat = baseChat()
    const u1 = node('user', 'q')
    const a1 = node('assistant', 'a')
    chat = appendNode(chat, u1)
    chat = appendNode(chat, a1)
    const a1b = node('assistant', 'regenerated')
    chat = addSibling(chat, a1.id, a1b)
    expect(deepestDescendant(chat, u1.id)).toBe(a1b.id)
  })
})

describe('pathToApiMessages', () => {
  it('drops the empty system root but keeps agent prompts', () => {
    let free = baseChat('')
    free = appendNode(free, node('user', 'hi'))
    expect(pathToApiMessages(resolvePath(free))).toEqual([{ role: 'user', content: 'hi' }])

    let agent = baseChat('You are a pirate.')
    agent = appendNode(agent, node('user', 'hi'))
    expect(pathToApiMessages(resolvePath(agent))).toEqual([
      { role: 'system', content: 'You are a pirate.' },
      { role: 'user', content: 'hi' },
    ])
  })

  it('drops empty assistant stubs (streaming placeholders)', () => {
    let chat = baseChat()
    chat = appendNode(chat, node('user', 'hi'))
    chat = appendNode(chat, { ...node('assistant', ''), status: 'streaming' })
    expect(pathToApiMessages(resolvePath(chat))).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('builds multimodal content parts for messages with images', () => {
    const uri = 'data:image/png;base64,abc'
    let chat = baseChat()
    chat = appendNode(chat, { ...node('user', 'what is this?'), images: [uri] })
    expect(pathToApiMessages(resolvePath(chat))).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what is this?' },
          { type: 'image_url', image_url: { url: uri } },
        ],
      },
    ])
  })

  it('omits the text part for image-only messages but keeps the message', () => {
    const uri = 'data:image/png;base64,abc'
    let chat = baseChat()
    chat = appendNode(chat, { ...node('user', ''), images: [uri] })
    expect(pathToApiMessages(resolvePath(chat))).toEqual([
      { role: 'user', content: [{ type: 'image_url', image_url: { url: uri } }] },
    ])
  })

  it('serializes assistant tool calls and tool results to the wire shape', () => {
    let chat = baseChat()
    chat = appendNode(chat, node('user', 'weather?'))
    chat = appendNode(chat, {
      ...node('assistant', ''),
      toolCalls: [{ id: 'call_1', name: 'srv__weather', arguments: '{"city":"SP"}' }],
    })
    chat = appendNode(chat, {
      ...node('tool', '22°C'),
      toolCallId: 'call_1',
      toolName: 'srv__weather',
    })
    expect(pathToApiMessages(resolvePath(chat))).toEqual([
      { role: 'user', content: 'weather?' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'srv__weather', arguments: '{"city":"SP"}' },
          },
        ],
      },
      { role: 'tool', content: '22°C', tool_call_id: 'call_1' },
    ])
  })
})
