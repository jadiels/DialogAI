import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { arrayMove } from '@dnd-kit/sortable'
import type { ConnectionProfile, McpServerEntry, SamplingParams, Settings, Theme } from '../lib/types'
import { defaultSettings, loadSettings, saveSettings } from '../lib/storage'
import { fetchModels, normalizeBaseUrl } from '../lib/api'

export interface ProfileInput {
  id?: string
  name: string
  baseUrl: string
  apiKey: string
  defaultModel: string
  /** Freshly fetched model list to cache along with the profile. */
  models?: string[]
}

interface SettingsState {
  settings: Settings
  saveProfile: (input: ProfileInput) => string
  deleteProfile: (id: string) => void
  /** Enable/disable a connection (multiple can be enabled at once). */
  toggleProfileEnabled: (id: string) => void
  /** Reorder connections by drag; order drives the model selector. */
  reorderProfiles: (activeId: string, overId: string) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setTheme: (theme: Theme) => void
  /** Global default model for utility tasks (title generation). */
  setTitleModel: (model: string) => void
  /** Default model for image generation. */
  setImageModel: (model: string) => void
  /** Patch the global default sampling params (undefined fields = "unset"). */
  setSampling: (patch: SamplingParams) => void
  /** Add or update an MCP server config; returns its id. */
  saveMcpServer: (input: Omit<McpServerEntry, 'id'> & { id?: string }) => string
  deleteMcpServer: (id: string) => void
  toggleMcpServerEnabled: (id: string) => void
  /** Reset all settings (connections + preferences) to defaults. */
  reset: () => void
  /** Fetches /v1/models for the profile, caches the list. Rethrows ApiError. */
  refreshModels: (profileId: string) => Promise<string[]>
  /** Pin/unpin a model to the top of the selector for a profile. */
  togglePinnedModel: (profileId: string, model: string) => void
}

function commit(set: (s: { settings: Settings }) => void, settings: Settings) {
  saveSettings(settings)
  set({ settings })
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: loadSettings(),

  saveProfile(input) {
    const { settings } = get()
    const baseUrl = normalizeBaseUrl(input.baseUrl)
    let profiles: ConnectionProfile[]
    let id = input.id
    if (id) {
      profiles = settings.profiles.map((p) =>
        p.id === id
          ? {
              ...p,
              ...input,
              id,
              baseUrl,
              // a different server means the cached model list is stale
              models: input.models ?? (baseUrl === p.baseUrl ? p.models : []),
            }
          : p,
      )
    } else {
      id = nanoid()
      profiles = [...settings.profiles, { ...input, id, baseUrl, models: input.models ?? [] }]
    }
    commit(set, {
      ...settings,
      profiles,
      // First connection created is enabled by default.
      enabledProfileIds:
        input.id || settings.enabledProfileIds.length > 0
          ? settings.enabledProfileIds
          : [id],
    })
    return id
  },

  deleteProfile(id) {
    const { settings } = get()
    commit(set, {
      ...settings,
      profiles: settings.profiles.filter((p) => p.id !== id),
      enabledProfileIds: settings.enabledProfileIds.filter((x) => x !== id),
    })
  },

  toggleProfileEnabled(id) {
    const { settings } = get()
    const enabled = settings.enabledProfileIds.includes(id)
      ? settings.enabledProfileIds.filter((x) => x !== id)
      : [...settings.enabledProfileIds, id]
    commit(set, { ...settings, enabledProfileIds: enabled })
  },

  reorderProfiles(activeId, overId) {
    const { settings } = get()
    const from = settings.profiles.findIndex((p) => p.id === activeId)
    const to = settings.profiles.findIndex((p) => p.id === overId)
    if (from < 0 || to < 0 || from === to) return
    commit(set, { ...settings, profiles: arrayMove(settings.profiles, from, to) })
  },

  setSidebarCollapsed(collapsed) {
    const { settings } = get()
    commit(set, { ...settings, ui: { ...settings.ui, sidebarCollapsed: collapsed } })
  },

  setTheme(theme) {
    const { settings } = get()
    commit(set, { ...settings, ui: { ...settings.ui, theme } })
  },

  setTitleModel(model) {
    commit(set, { ...get().settings, titleModel: model.trim() || undefined })
  },

  setImageModel(model) {
    commit(set, { ...get().settings, imageModel: model.trim() || undefined })
  },

  setSampling(patch) {
    const { settings } = get()
    const merged = { ...settings.sampling, ...patch }
    for (const k of Object.keys(merged) as (keyof SamplingParams)[]) {
      if (merged[k] === undefined) delete merged[k]
    }
    commit(set, { ...settings, sampling: Object.keys(merged).length ? merged : undefined })
  },

  saveMcpServer(input) {
    const { settings } = get()
    const servers = settings.mcpServers ?? []
    const id = input.id ?? nanoid()
    const entry: McpServerEntry = { ...input, id, url: input.url.trim() }
    const mcpServers = input.id
      ? servers.map((s) => (s.id === id ? entry : s))
      : [...servers, entry]
    commit(set, { ...settings, mcpServers })
    return id
  },

  deleteMcpServer(id) {
    const { settings } = get()
    commit(set, { ...settings, mcpServers: (settings.mcpServers ?? []).filter((s) => s.id !== id) })
  },

  toggleMcpServerEnabled(id) {
    const { settings } = get()
    commit(set, {
      ...settings,
      mcpServers: (settings.mcpServers ?? []).map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      ),
    })
  },

  reset() {
    commit(set, defaultSettings())
  },

  async refreshModels(profileId) {
    const profile = get().settings.profiles.find((p) => p.id === profileId)
    if (!profile) return []
    const models = await fetchModels(profile)
    const { settings } = get()
    commit(set, {
      ...settings,
      profiles: settings.profiles.map((p) =>
        p.id === profileId ? { ...p, models, modelsFetchedAt: Date.now() } : p,
      ),
    })
    return models
  },

  togglePinnedModel(profileId, model) {
    const { settings } = get()
    commit(set, {
      ...settings,
      profiles: settings.profiles.map((p) => {
        if (p.id !== profileId) return p
        const pinned = p.pinnedModels ?? []
        return {
          ...p,
          pinnedModels: pinned.includes(model)
            ? pinned.filter((m) => m !== model)
            : [...pinned, model],
        }
      }),
    })
  },
}))

/** Enabled connections, in the profiles' (drag-ordered) order. */
export function enabledProfiles(settings: Settings): ConnectionProfile[] {
  return settings.profiles.filter((p) => settings.enabledProfileIds.includes(p.id))
}

/** The primary connection — first enabled — used as the default for new chats. */
export function activeProfile(settings: Settings): ConnectionProfile | null {
  return enabledProfiles(settings)[0] ?? null
}

export function profileById(settings: Settings, id?: string): ConnectionProfile | null {
  return (id && settings.profiles.find((p) => p.id === id)) || null
}

/** Resolve the connection a chat should use, falling back to the primary one. */
export function profileForChat(
  settings: Settings,
  chat: { profileId?: string },
): ConnectionProfile | null {
  return profileById(settings, chat.profileId) ?? activeProfile(settings)
}

export function useActiveProfile(): ConnectionProfile | null {
  return useSettingsStore((s) => activeProfile(s.settings))
}

export function useEnabledProfiles(): ConnectionProfile[] {
  return useSettingsStore((s) => enabledProfiles(s.settings))
}
