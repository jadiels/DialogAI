import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Chat, ConnectionProfile } from '../../lib/types'
import { useAgentsStore } from '../../stores/agentsStore'
import { enabledProfiles, useSettingsStore } from '../../stores/settingsStore'
import { useChatsStore } from '../../stores/chatsStore'
import { errorMessage, isAbortError, pullModel } from '../../lib/api'
import { isChatModel } from '../../lib/modelKind'
import { Icon } from '../ui/icons'
import { useClickOutside } from '../ui/useClickOutside'

type Tab = 'model' | 'agent'

/**
 * Top-left selector. "Model" tab lists the models of every enabled connection
 * (grouped, in connection order); picking one binds the chat to that model AND
 * connection. "Agent" tab picks an agent + model. Also supports per-connection
 * refresh, pin-to-top and Ollama pull.
 */
export default function ModelSelector({ chat }: { chat?: Chat }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('model')
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => close())

  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<{ id: string; msg: string } | null>(null)
  const [refreshCount, setRefreshCount] = useState<{ id: string; count: number } | null>(null)
  const [pulling, setPulling] = useState<{ profileId: string; model: string } | null>(null)
  const [pullStatus, setPullStatus] = useState('')
  const [pullPct, setPullPct] = useState<number | null>(null)
  const [pullError, setPullError] = useState('')
  const pullAbort = useRef<AbortController | null>(null)

  const navigate = useNavigate()
  const settings = useSettingsStore((s) => s.settings)
  const enabled = useMemo(() => enabledProfiles(settings), [settings])
  const refreshModels = useSettingsStore((s) => s.refreshModels)
  const togglePinnedModel = useSettingsStore((s) => s.togglePinnedModel)
  const agents = useAgentsStore((s) => s.agents)
  const draft = useChatsStore((s) => s.draft)
  const setDraft = useChatsStore((s) => s.setDraft)
  const setChatModel = useChatsStore((s) => s.setChatModel)

  const draftAgent = agents.find((a) => a.id === draft.agentId)
  const currentProfileId = chat ? chat.profileId : draft.profileId
  const currentProfile = enabled.find((p) => p.id === currentProfileId) ?? enabled[0] ?? null
  const currentModel = chat
    ? chat.model
    : draft.model || draftAgent?.defaultModel || currentProfile?.defaultModel || ''
  const currentAgentName = chat ? chat.agentName : draftAgent?.name
  const trimmedQuery = query.trim()
  // Once the first message is sent, the agent/free mode is fixed — only the
  // model can change. Before that (a draft, or an empty chat) both are allowed.
  const locked = !!chat && (chat.nodes[chat.rootId]?.childrenIds.length ?? 0) > 0

  function close() {
    setOpen(false)
    setExpandedAgentId(null)
    setQuery('')
  }

  function pickModel(profileId: string, model: string) {
    if (chat) setChatModel(chat.id, model, profileId)
    else setDraft({ agentId: null, model, profileId })
    close()
  }

  function pickAgent(agentId: string, model: string, profileId: string) {
    setDraft({ agentId, model, profileId })
    close()
    if (chat) navigate('/')
  }

  /**
   * Chat-capable models for a connection, pinned ones floated to the top.
   * Non-chat models (image/embedding/audio, guessed by name) are hidden, but a
   * pinned or currently-selected model is always kept in case the guess is wrong.
   */
  function groupModels(p: ConnectionProfile): string[] {
    const pins = p.pinnedModels ?? []
    const keep = (m: string) =>
      isChatModel(m) || pins.includes(m) || (currentProfileId === p.id && m === currentModel)
    const base = p.models.filter(keep)
    if (currentProfileId === p.id && currentModel && !base.includes(currentModel)) {
      base.unshift(currentModel)
    }
    const q = trimmedQuery.toLowerCase()
    const matched = q ? base.filter((m) => m.toLowerCase().includes(q)) : base
    return [...pins.filter((m) => matched.includes(m)), ...matched.filter((m) => !pins.includes(m))]
  }

  /** Enabled connection whose model list best matches a given model name. */
  function profileForModel(model: string): ConnectionProfile | null {
    return enabled.find((p) => p.models.includes(model)) ?? enabled[0] ?? null
  }

  async function handleRefresh(id: string) {
    if (refreshingId) return
    setRefreshingId(id)
    setRefreshError(null)
    setRefreshCount(null)
    try {
      const models = await refreshModels(id)
      setRefreshCount({ id, count: models.length })
    } catch (err) {
      setRefreshError({ id, msg: errorMessage(err) })
    } finally {
      setRefreshingId(null)
    }
  }

  async function handlePull(profileId: string, name: string) {
    if (pulling) return
    const p = enabled.find((x) => x.id === profileId)
    if (!p) return
    const controller = new AbortController()
    pullAbort.current = controller
    setPulling({ profileId, model: name })
    setPullStatus('starting…')
    setPullPct(null)
    setPullError('')
    try {
      await pullModel(
        p.baseUrl,
        p.apiKey,
        name,
        (prog) => {
          setPullStatus(prog.status)
          setPullPct(prog.total ? Math.round(((prog.completed ?? 0) / prog.total) * 100) : null)
        },
        controller.signal,
      )
      await refreshModels(profileId).catch(() => {})
      setQuery('')
      pickModel(profileId, name)
    } catch (err) {
      if (!isAbortError(err)) setPullError(errorMessage(err))
    } finally {
      setPulling(null)
      pullAbort.current = null
    }
  }

  if (!enabled.length) return null

  const anyMatch = enabled.some((p) => p.models.includes(trimmedQuery))
  const customTargetId = currentProfile?.id ?? enabled[0].id

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          // Opening: start on the tab that reflects the current selection.
          if (!open && !locked) setTab(draft.agentId ? 'agent' : 'model')
          setOpen((o) => !o)
        }}
        className="flex max-w-[70vw] items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-300 hover:bg-white/10 md:max-w-none"
      >
        {currentAgentName ? (
          <>
            <Icon name="agents" size={15} className="shrink-0" />
            <span className="truncate">{currentAgentName}</span>
            <span className="text-gray-500">·</span>
          </>
        ) : null}
        <span className="truncate">{currentModel || 'Select model'}</span>
        {currentProfile && (
          <>
            <span className="hidden text-gray-500 sm:inline">·</span>
            <span className="hidden shrink-0 text-xs font-normal text-gray-500 sm:inline">
              {currentProfile.name}
            </span>
          </>
        )}
        <Icon name="chevronDown" size={14} className="shrink-0 text-gray-500" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-white/10 bg-elevated shadow-xl">
          {!locked && (
            <div className="flex gap-1 border-b border-white/10 p-1.5">
              {(['model', 'agent'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-sm capitalize ${
                    tab === t ? 'bg-white/10 text-gray-100' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {(locked || tab === 'model') && (
            <div className="p-1.5">
              <div className="mb-1 flex items-center gap-2 rounded-lg bg-white/5 px-2.5 ring-1 ring-white/10 focus-within:ring-white/25">
                <Icon name="search" size={14} className="shrink-0 text-gray-500" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && trimmedQuery) pickModel(customTargetId, trimmedQuery)
                  }}
                  placeholder="Search or type a model…"
                  className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-gray-500"
                />
              </div>

              <div className="max-h-72 overflow-y-auto">
                {enabled.map((p) => {
                  const list = groupModels(p)
                  const pins = p.pinnedModels ?? []
                  const canPull = !!trimmedQuery && !p.models.includes(trimmedQuery)
                  return (
                    <div key={p.id} className="mb-1">
                      <div className="flex items-center justify-between gap-2 px-1.5 pt-1">
                        <span className="truncate text-xs font-medium text-gray-500" title={p.baseUrl}>
                          {p.name}
                        </span>
                        <button
                          onClick={() => void handleRefresh(p.id)}
                          disabled={refreshingId === p.id}
                          className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-gray-200"
                          aria-label={`Refresh ${p.name} models`}
                          title="Revalidate the API and refresh the model list"
                        >
                          <Icon
                            name="refresh"
                            size={13}
                            className={refreshingId === p.id ? 'animate-spin' : ''}
                          />
                        </button>
                      </div>
                      {refreshError?.id === p.id && (
                        <p className="px-1.5 py-1 text-xs text-red-400">{refreshError.msg}</p>
                      )}
                      {refreshCount?.id === p.id && (
                        <p className="px-1.5 py-1 text-xs text-accent">
                          {refreshCount.count} {refreshCount.count === 1 ? 'model' : 'models'} found
                        </p>
                      )}

                      {list.map((m) => {
                        const isPinned = pins.includes(m)
                        return (
                          <div
                            key={m}
                            className="group/mi flex items-center rounded-lg hover:bg-white/10"
                          >
                            <button
                              onClick={() => pickModel(p.id, m)}
                              className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm text-gray-200"
                            >
                              <span className="truncate">{m}</span>
                              {m === currentModel && currentProfileId === p.id && !currentAgentName && (
                                <Icon name="check" size={14} className="shrink-0 text-gray-400" />
                              )}
                            </button>
                            <button
                              onClick={() => togglePinnedModel(p.id, m)}
                              className={`mr-1 shrink-0 rounded-lg p-1.5 hover:bg-white/10 ${
                                isPinned
                                  ? 'text-accent'
                                  : 'text-gray-400 opacity-0 group-hover/mi:opacity-100'
                              }`}
                              aria-label={isPinned ? 'Unpin model' : 'Pin model to top'}
                              title={isPinned ? 'Unpin' : 'Pin to top'}
                            >
                              <Icon name="pin" size={14} />
                            </button>
                          </div>
                        )
                      })}

                      {list.length === 0 && !canPull && (
                        <p className="px-3 py-1.5 text-xs text-gray-500">
                          {trimmedQuery ? 'No match.' : 'No models.'}
                        </p>
                      )}

                      {canPull &&
                        (pulling?.profileId === p.id && pulling.model === trimmedQuery ? (
                          <button
                            onClick={() => pullAbort.current?.abort()}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10"
                            title="Cancel pull"
                          >
                            <Icon
                              name="refresh"
                              size={14}
                              className="shrink-0 animate-spin text-accent"
                            />
                            <span className="truncate">
                              Pulling… {pullPct !== null ? `${pullPct}%` : pullStatus}
                            </span>
                            <Icon name="x" size={13} className="ml-auto shrink-0 text-gray-500" />
                          </button>
                        ) : (
                          <button
                            onClick={() => void handlePull(p.id, trimmedQuery)}
                            disabled={!!pulling}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-gray-400 hover:bg-white/10 disabled:opacity-50"
                          >
                            <Icon name="download" size={14} className="shrink-0" />
                            Pull “{trimmedQuery}” here
                          </button>
                        ))}
                      {pulling?.profileId === p.id && pullError && (
                        <p className="px-3 py-1 text-xs text-red-400">{pullError}</p>
                      )}
                    </div>
                  )
                })}

                {trimmedQuery && !anyMatch && (
                  <button
                    onClick={() => pickModel(customTargetId, trimmedQuery)}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-white/10 px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10"
                  >
                    <Icon name="check" size={14} className="shrink-0 text-gray-500" />
                    Use “{trimmedQuery}” as custom model
                  </button>
                )}
              </div>
            </div>
          )}

          {!locked && tab === 'agent' && (
            <div className="max-h-80 overflow-y-auto p-1.5">
              {agents.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-500">
                  No agents yet — create one in the Agents page.
                </p>
              )}
              {agents.map((agent) => {
                const agentProfile = agent.defaultModel
                  ? profileForModel(agent.defaultModel)
                  : enabled[0]
                const agentDefault = agent.defaultModel || agentProfile?.defaultModel || ''
                const expanded = expandedAgentId === agent.id
                return (
                  <div key={agent.id}>
                    <div className="flex items-center rounded-lg hover:bg-white/10">
                      <button
                        onClick={() =>
                          agentProfile && pickAgent(agent.id, agentDefault, agentProfile.id)
                        }
                        className="flex min-w-0 flex-1 flex-col items-start px-3 py-2 text-left"
                      >
                        <span className="w-full truncate text-sm text-gray-200">{agent.name}</span>
                        <span className="w-full truncate text-xs text-gray-500">
                          {agentDefault}
                          {agentProfile && ` · ${agentProfile.name}`}
                        </span>
                      </button>
                      <button
                        onClick={() => setExpandedAgentId(expanded ? null : agent.id)}
                        className="mr-1 rounded-lg p-1.5 text-gray-400 hover:bg-white/10"
                        aria-label="Choose a different model for this agent"
                      >
                        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} />
                      </button>
                    </div>
                    {expanded && (
                      <div className="ml-3 border-l border-white/10 pl-2">
                        {enabled.map((p) => (
                          <div key={p.id}>
                            <div className="px-3 pt-1 text-xs font-medium text-gray-500">
                              {p.name}
                            </div>
                            {p.models.map((m) => (
                              <button
                                key={`${p.id}:${m}`}
                                onClick={() => pickAgent(agent.id, m, p.id)}
                                className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10"
                              >
                                <span className="truncate">{m}</span>
                                {m === agentDefault && p.id === agentProfile?.id && (
                                  <span className="shrink-0 text-xs text-gray-500">default</span>
                                )}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
