import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { arrayMove } from '@dnd-kit/sortable'
import type { Agent, SamplingParams } from '../lib/types'
import * as storage from '../lib/storage'

export interface AgentInput {
  id?: string
  name: string
  systemPrompt: string
  defaultModel: string
  sampling?: SamplingParams
}

interface AgentsState {
  /** Sorted by sortOrder. */
  agents: Agent[]
  loaded: boolean
  loadAll: () => Promise<void>
  saveAgent: (input: AgentInput) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
  reorder: (activeId: string, overId: string) => Promise<void>
  /** Pin/unpin an agent so it shows in the sidebar under "Agents". */
  togglePinned: (id: string) => Promise<void>
  clearAll: () => Promise<void>
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  agents: [],
  loaded: false,

  async loadAll() {
    if (get().loaded) return
    const agents = await storage.getAllAgents()
    set({ agents, loaded: true })
  },

  async saveAgent(input) {
    const { agents } = get()
    if (input.id) {
      const updated = agents.map((a) => (a.id === input.id ? { ...a, ...input, id: a.id } : a))
      set({ agents: updated })
      await storage.putAgent(updated.find((a) => a.id === input.id)!)
    } else {
      const agent: Agent = {
        ...input,
        id: nanoid(),
        sortOrder: agents.length ? Math.max(...agents.map((a) => a.sortOrder)) + 1 : 0,
        createdAt: Date.now(),
      }
      set({ agents: [...agents, agent] })
      await storage.putAgent(agent)
    }
  },

  async deleteAgent(id) {
    set({ agents: get().agents.filter((a) => a.id !== id) })
    await storage.deleteAgent(id)
  },

  async togglePinned(id) {
    const updated = get().agents.map((a) => (a.id === id ? { ...a, pinned: !a.pinned } : a))
    set({ agents: updated })
    const agent = updated.find((a) => a.id === id)
    if (agent) await storage.putAgent(agent)
  },

  async reorder(activeId, overId) {
    const { agents } = get()
    const from = agents.findIndex((a) => a.id === activeId)
    const to = agents.findIndex((a) => a.id === overId)
    if (from < 0 || to < 0 || from === to) return
    const reordered = arrayMove(agents, from, to).map((a, i) => ({ ...a, sortOrder: i }))
    set({ agents: reordered })
    await storage.putAgents(reordered)
  },

  async clearAll() {
    set({ agents: [] })
    await storage.clearStore('agents')
  },
}))
