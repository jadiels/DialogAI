import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Chat, ConnectionProfile, MessageNode, SamplingParams } from '../lib/types'
import {
  addSibling,
  appendNode,
  createChat,
  navigateSibling,
  pathToApiMessages,
  resolvePath,
  updateNode,
} from '../lib/messageTree'
import {
  complete,
  computeMetrics,
  errorMessage,
  isAbortError,
  newStreamStats,
  streamChat,
} from '../lib/api'
import { deriveTitle } from '../lib/title'
import { resolveSampling } from '../lib/sampling'
import * as storage from '../lib/storage'
import { activeProfile, profileById, profileForChat, useSettingsStore } from './settingsStore'
import { useAgentsStore } from './agentsStore'

/** Model/agent selection for the next chat (the "/" new-chat screen). */
export interface Draft {
  agentId: string | null
  model: string | null
  profileId: string | null
  /** Per-chat sampling override chosen before the first message is sent. */
  sampling: SamplingParams | null
}

interface ChatsState {
  chats: Record<string, Chat>
  loaded: boolean
  draft: Draft
  /** AbortControllers per streaming chat; presence == "is streaming". */
  streams: Record<string, AbortController>

  loadAll: () => Promise<void>
  setDraft: (draft: Partial<Draft>) => void
  resetDraft: () => void
  /** Creates a chat from the current draft and sends the first message. */
  startChat: (firstMessage: string, images?: string[]) => Promise<string | null>
  sendMessage: (chatId: string, content: string, images?: string[]) => Promise<void>
  /** Edit a user message: new sibling branch + resend. */
  editMessage: (chatId: string, nodeId: string, content: string, images?: string[]) => Promise<void>
  /** New assistant sibling, streamed with the chat's current model. */
  regenerate: (chatId: string, assistantNodeId: string) => Promise<void>
  navigate: (chatId: string, nodeId: string, dir: 1 | -1) => void
  /** Switch the chat's model, and optionally the connection it talks to. */
  setChatModel: (chatId: string, model: string, profileId?: string) => void
  /** Patch the chat's per-chat sampling override (undefined fields = "inherit"). */
  setChatSampling: (chatId: string, patch: SamplingParams) => void
  stop: (chatId: string) => void
  deleteChat: (chatId: string) => Promise<void>
  renameChat: (chatId: string, title: string) => void
  /** Regenerate the chat title with the global title model. Rethrows on failure. */
  regenerateTitle: (chatId: string) => Promise<void>
  clearAll: () => Promise<void>
}

const lastSavedAt: Record<string, number> = {}

/** Normalize a model-generated title: first line, no quotes/label/trailing dot. */
function cleanTitle(raw: string): string {
  return raw
    .split('\n')[0]
    .replace(/^\s*title:\s*/i, '')
    .replace(/^["'“”\s]+|["'“”\s]+$/g, '')
    .replace(/[.]+$/, '')
    .trim()
    .slice(0, 80)
}

/** Ask `model` for a concise title based on the chat's visible conversation. */
async function titleFromChat(
  profile: ConnectionProfile,
  chat: Chat,
  model: string,
): Promise<string> {
  const transcript = resolvePath(chat)
    .filter((n) => n.role !== 'system' && n.content)
    .map((n) => `${n.role === 'user' ? 'User' : 'Assistant'}: ${n.content}`)
    .join('\n\n')
    .slice(0, 4000)
  if (!transcript) return ''
  const raw = await complete(
    {
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      model,
      messages: [
        {
          role: 'system',
          content:
            "You generate a concise, descriptive title for a conversation. Reply with only the title: 3 to 6 words, plain text, no surrounding quotes, no trailing punctuation. Always write the title in the same language as the user's first message.",
        },
        { role: 'user', content: `Conversation:\n\n${transcript}\n\nTitle:` },
      ],
    },
    new AbortController().signal,
  )
  return cleanTitle(raw)
}

/**
 * A chat persisted mid-stream keeps its assistant node on 'streaming', but the
 * live AbortController is gone after a reload. Turn those into a finished (if
 * partial content arrived) or retry-able error state so they aren't zombies.
 */
function reconcileInterrupted(chat: Chat): Chat {
  let changed = false
  const nodes: Chat['nodes'] = {}
  for (const [id, node] of Object.entries(chat.nodes)) {
    if (node.status === 'streaming') {
      changed = true
      nodes[id] = node.content
        ? { ...node, status: 'done' }
        : { ...node, status: 'error', error: 'Generation was interrupted.' }
    } else {
      nodes[id] = node
    }
  }
  return changed ? { ...chat, nodes } : chat
}

function persistChat(chat: Chat, force = false) {
  const now = Date.now()
  if (!force && now - (lastSavedAt[chat.id] ?? 0) < 1000) return
  lastSavedAt[chat.id] = now
  void storage.putChat(chat)
}

export const useChatsStore = create<ChatsState>((set, get) => {
  function commit(chat: Chat, force = true) {
    set((s) => ({ chats: { ...s.chats, [chat.id]: chat } }))
    persistChat(chat, force)
  }

  /**
   * Streams a completion into `nodeId` (an empty assistant node already in
   * the tree). The conversation payload is the visible path — empty
   * assistant stubs are filtered out by pathToApiMessages.
   */
  async function runCompletion(chatId: string, nodeId: string): Promise<void> {
    const chat = get().chats[chatId]
    if (!chat) return
    const profile = profileForChat(useSettingsStore.getState().settings, chat)
    if (!profile) {
      // Don't leave the just-appended stub stuck on 'streaming'.
      commit({
        ...updateNode(chat, nodeId, {
          status: 'error',
          error: 'No active connection. Configure one in Settings.',
        }),
        updatedAt: Date.now(),
      })
      return
    }

    const messages = pathToApiMessages(resolvePath(chat))
    const model = chat.nodes[nodeId].model ?? chat.model
    // Resolve sampling: global defaults → agent override → per-chat override.
    const settings = useSettingsStore.getState().settings
    const agent = chat.agentId
      ? useAgentsStore.getState().agents.find((a) => a.id === chat.agentId)
      : undefined
    const sampling = resolveSampling(settings.sampling, agent?.sampling, chat.sampling)
    const controller = new AbortController()
    set((s) => ({ streams: { ...s.streams, [chatId]: controller } }))

    let pendingContent = ''
    let pendingReasoning = ''
    let frame = 0
    const flush = () => {
      frame = 0
      if (!pendingContent && !pendingReasoning) return
      const content = pendingContent
      const reasoning = pendingReasoning
      pendingContent = ''
      pendingReasoning = ''
      const current = get().chats[chatId]
      if (!current) return
      const node = current.nodes[nodeId]
      const updated = updateNode(current, nodeId, {
        content: node.content + content,
        reasoning: reasoning ? (node.reasoning ?? '') + reasoning : node.reasoning,
      })
      set((s) => ({ chats: { ...s.chats, [chatId]: updated } }))
      persistChat(updated)
    }

    const finalize = (patch: Partial<MessageNode>) => {
      if (frame) cancelAnimationFrame(frame)
      flush()
      const current = get().chats[chatId]
      if (!current) return // chat deleted mid-stream
      commit({ ...updateNode(current, nodeId, patch), updatedAt: Date.now() })
    }

    const stats = newStreamStats()
    try {
      await streamChat(
        { baseUrl: profile.baseUrl, apiKey: profile.apiKey, model, messages, sampling },
        (delta) => {
          if (delta.content) pendingContent += delta.content
          if (delta.reasoning) pendingReasoning += delta.reasoning
          frame ||= requestAnimationFrame(flush)
        },
        controller.signal,
        stats,
      )
      finalize({ status: 'done', metrics: computeMetrics(stats) })
    } catch (err) {
      // Stop keeps partial content and whatever metrics we gathered.
      if (isAbortError(err)) finalize({ status: 'done', metrics: computeMetrics(stats) })
      else finalize({ status: 'error', error: errorMessage(err) })
    } finally {
      set((s) => {
        const streams = { ...s.streams }
        delete streams[chatId]
        return { streams }
      })
    }
  }

  /**
   * Auto-generate the title after the first exchange, using the chat's CURRENT
   * model — the one Ollama already has loaded — so we don't force a GPU model
   * swap just to name the chat. Best-effort; keeps the truncated placeholder on
   * failure.
   */
  async function maybeAutoTitle(chatId: string): Promise<void> {
    const chat = get().chats[chatId]
    if (!chat) return
    const profile = profileForChat(useSettingsStore.getState().settings, chat)
    if (!profile) return
    const leaf = chat.nodes[chat.currentLeafId]
    // Only when the first assistant reply actually produced content.
    if (leaf?.role !== 'assistant' || leaf.status === 'error' || !leaf.content) return
    try {
      const title = await titleFromChat(profile, chat, chat.model)
      const current = get().chats[chatId]
      if (title && current) commit({ ...current, title })
    } catch {
      // keep the truncated placeholder
    }
  }

  return {
    chats: {},
    loaded: false,
    draft: { agentId: null, model: null, profileId: null, sampling: null },
    streams: {},

    async loadAll() {
      if (get().loaded) return
      const all = await storage.getAllChats()
      set({ chats: Object.fromEntries(all.map((c) => [c.id, reconcileInterrupted(c)])), loaded: true })
    },

    setDraft(draft) {
      set((s) => ({ draft: { ...s.draft, ...draft } }))
    },

    resetDraft() {
      set({ draft: { agentId: null, model: null, profileId: null, sampling: null } })
    },

    async startChat(firstMessage, images) {
      const settings = useSettingsStore.getState().settings
      const { draft } = get()
      const profile = profileById(settings, draft.profileId ?? undefined) ?? activeProfile(settings)
      if (!profile) return null
      const agent = draft.agentId
        ? useAgentsStore.getState().agents.find((a) => a.id === draft.agentId)
        : undefined
      const model = draft.model || agent?.defaultModel || profile.defaultModel
      const chat = {
        ...createChat({
          id: nanoid(),
          rootId: nanoid(),
          model,
          profileId: profile.id,
          systemPrompt: agent?.systemPrompt ?? '',
          agentId: agent?.id,
          agentName: agent?.name,
          createdAt: Date.now(),
        }),
        // Bake the draft's sampling override into the chat (agent params are
        // applied live from the agent at send time, so only the draft goes here).
        sampling: draft.sampling ?? undefined,
      }
      commit(chat)
      // The draft has been baked into the chat; clear it so the next new chat
      // doesn't silently inherit this agent/model.
      set({ draft: { agentId: null, model: null, profileId: null, sampling: null } })
      void get().sendMessage(chat.id, firstMessage, images)
      return chat.id
    },

    async sendMessage(chatId, content, images) {
      let chat = get().chats[chatId]
      if (!chat || get().streams[chatId]) return
      const isFirstMessage = chat.nodes[chat.rootId].childrenIds.length === 0
      chat = appendNode(chat, { id: nanoid(), role: 'user', content, images, createdAt: Date.now() })
      if (isFirstMessage) chat = { ...chat, title: deriveTitle(content) }
      chat = appendNode(chat, {
        id: nanoid(),
        role: 'assistant',
        content: '',
        model: chat.model,
        createdAt: Date.now(),
        status: 'streaming',
      })
      commit({ ...chat, updatedAt: Date.now() })
      await runCompletion(chatId, chat.currentLeafId)
      if (isFirstMessage) void maybeAutoTitle(chatId)
    },

    async editMessage(chatId, nodeId, content, images) {
      let chat = get().chats[chatId]
      if (!chat || get().streams[chatId]) return
      chat = addSibling(chat, nodeId, {
        id: nanoid(),
        role: 'user',
        content,
        // Text-only edits keep the original attachments on the new branch.
        images: images ?? chat.nodes[nodeId].images,
        createdAt: Date.now(),
      })
      chat = appendNode(chat, {
        id: nanoid(),
        role: 'assistant',
        content: '',
        model: chat.model,
        createdAt: Date.now(),
        status: 'streaming',
      })
      commit({ ...chat, updatedAt: Date.now() })
      await runCompletion(chatId, chat.currentLeafId)
    },

    async regenerate(chatId, assistantNodeId) {
      let chat = get().chats[chatId]
      if (!chat || get().streams[chatId]) return
      chat = addSibling(chat, assistantNodeId, {
        id: nanoid(),
        role: 'assistant',
        content: '',
        model: chat.model,
        createdAt: Date.now(),
        status: 'streaming',
      })
      commit({ ...chat, updatedAt: Date.now() })
      await runCompletion(chatId, chat.currentLeafId)
    },

    navigate(chatId, nodeId, dir) {
      const chat = get().chats[chatId]
      if (!chat) return
      commit(navigateSibling(chat, nodeId, dir))
    },

    setChatModel(chatId, model, profileId) {
      const chat = get().chats[chatId]
      if (!chat) return
      commit({ ...chat, model, profileId: profileId ?? chat.profileId })
    },

    setChatSampling(chatId, patch) {
      const chat = get().chats[chatId]
      if (!chat) return
      // Merge the patch, then drop keys set back to undefined so "cleared"
      // fields fall through to the agent/global default again.
      const merged = { ...chat.sampling, ...patch }
      for (const k of Object.keys(merged) as (keyof SamplingParams)[]) {
        if (merged[k] === undefined) delete merged[k]
      }
      commit({ ...chat, sampling: Object.keys(merged).length ? merged : undefined })
    },

    stop(chatId) {
      get().streams[chatId]?.abort()
    },

    renameChat(chatId, title) {
      const chat = get().chats[chatId]
      if (!chat || !title.trim()) return
      commit({ ...chat, title: title.trim() })
    },

    async regenerateTitle(chatId) {
      const settings = useSettingsStore.getState().settings
      const chat = get().chats[chatId]
      if (!chat) return
      const profile = profileForChat(settings, chat)
      if (!profile) return
      // Manual regeneration uses the global title model (falls back to the
      // chat connection's default).
      const model = settings.titleModel || profile.defaultModel
      const title = await titleFromChat(profile, chat, model)
      const current = get().chats[chatId]
      if (title && current) commit({ ...current, title })
    },

    async deleteChat(chatId) {
      get().streams[chatId]?.abort()
      set((s) => {
        const chats = { ...s.chats }
        delete chats[chatId]
        return { chats }
      })
      await storage.deleteChat(chatId)
    },

    async clearAll() {
      Object.values(get().streams).forEach((c) => c.abort())
      set({ chats: {} })
      await storage.clearStore('chats')
    },
  }
})

/** Chats sorted for the sidebar (most recently updated first). */
export function sortedChats(chats: Record<string, Chat>): Chat[] {
  return Object.values(chats).sort((a, b) => b.updatedAt - a.updatedAt)
}
