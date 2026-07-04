import type { Chat, MessageNode, Role } from './types'

export interface NewNode {
  id: string
  role: Role
  content: string
  model?: string
  createdAt: number
  status?: MessageNode['status']
}

export interface NewChatParams {
  id: string
  rootId: string
  model: string
  profileId?: string
  systemPrompt: string
  agentId?: string
  agentName?: string
  createdAt: number
}

export function createChat(params: NewChatParams): Chat {
  const root: MessageNode = {
    id: params.rootId,
    parentId: null,
    childrenIds: [],
    role: 'system',
    content: params.systemPrompt,
    createdAt: params.createdAt,
  }
  return {
    id: params.id,
    title: 'New chat',
    agentId: params.agentId,
    agentName: params.agentName,
    model: params.model,
    profileId: params.profileId,
    rootId: root.id,
    currentLeafId: root.id,
    nodes: { [root.id]: root },
    createdAt: params.createdAt,
    updatedAt: params.createdAt,
  }
}

/** Visible conversation: path from root to currentLeafId. */
export function resolvePath(chat: Chat): MessageNode[] {
  const path: MessageNode[] = []
  let cur: MessageNode | undefined = chat.nodes[chat.currentLeafId]
  while (cur) {
    path.push(cur)
    cur = cur.parentId !== null ? chat.nodes[cur.parentId] : undefined
  }
  return path.reverse()
}

/** Append as child of the current leaf and advance the leaf. */
export function appendNode(chat: Chat, node: NewNode): Chat {
  return addChild(chat, chat.currentLeafId, node)
}

/**
 * Edit / regenerate: insert the node as a NEW SIBLING of `siblingOfId`
 * (same parent). The old branch is preserved, just no longer selected.
 */
export function addSibling(chat: Chat, siblingOfId: string, node: NewNode): Chat {
  const parentId = chat.nodes[siblingOfId]?.parentId
  if (parentId == null) throw new Error(`Cannot branch from the root node`)
  return addChild(chat, parentId, node)
}

function addChild(chat: Chat, parentId: string, node: NewNode): Chat {
  const parent = chat.nodes[parentId]
  if (!parent) throw new Error(`Unknown parent node: ${parentId}`)
  const child: MessageNode = { ...node, parentId, childrenIds: [] }
  return {
    ...chat,
    nodes: {
      ...chat.nodes,
      [parentId]: { ...parent, childrenIds: [...parent.childrenIds, child.id] },
      [child.id]: child,
    },
    currentLeafId: child.id,
  }
}

export function updateNode(chat: Chat, nodeId: string, patch: Partial<MessageNode>): Chat {
  const node = chat.nodes[nodeId]
  if (!node) return chat
  return { ...chat, nodes: { ...chat.nodes, [nodeId]: { ...node, ...patch } } }
}

/** Follow the LAST child at each level (most recently created branch tip). */
export function deepestDescendant(chat: Chat, nodeId: string): string {
  let cur = chat.nodes[nodeId]
  while (cur && cur.childrenIds.length > 0) {
    cur = chat.nodes[cur.childrenIds[cur.childrenIds.length - 1]]
  }
  return cur ? cur.id : nodeId
}

export function siblingInfo(chat: Chat, nodeId: string): { index: number; count: number } {
  const node = chat.nodes[nodeId]
  if (!node || node.parentId === null) return { index: 0, count: 1 }
  const siblings = chat.nodes[node.parentId].childrenIds
  return { index: siblings.indexOf(nodeId), count: siblings.length }
}

/** The "< 2/2 >" arrows: select a sibling branch and show its conversation. */
export function navigateSibling(chat: Chat, nodeId: string, dir: 1 | -1): Chat {
  const node = chat.nodes[nodeId]
  if (!node || node.parentId === null) return chat
  const siblings = chat.nodes[node.parentId].childrenIds
  const target = siblings[siblings.indexOf(nodeId) + dir]
  if (!target) return chat
  return { ...chat, currentLeafId: deepestDescendant(chat, target) }
}

/** Build the API payload, dropping the empty system root and empty assistant stubs. */
export function pathToApiMessages(path: MessageNode[]): { role: Role; content: string }[] {
  return path
    .filter((n) => !(n.role === 'system' && n.content.trim() === ''))
    .filter((n) => !(n.role === 'assistant' && n.content === ''))
    .map((n) => ({ role: n.role, content: n.content }))
}
