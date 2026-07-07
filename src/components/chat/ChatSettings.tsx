import { useRef, useState } from 'react'
import type { Chat, SamplingParams } from '../../lib/types'
import { useAgentsStore } from '../../stores/agentsStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useChatsStore } from '../../stores/chatsStore'
import { resolveSampling } from '../../lib/sampling'
import SamplingFields from '../settings/SamplingFields'
import { Icon } from '../ui/icons'
import { useClickOutside } from '../ui/useClickOutside'

/**
 * Gear popover in the chat header: per-chat sampling overrides. Works on an
 * existing chat (persisted via setChatSampling) or on the new-chat draft
 * (baked into the chat on first send). Placeholders show the value each empty
 * field currently inherits (global → agent).
 */
export default function ChatSettings({ chat }: { chat?: Chat }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  const globalSampling = useSettingsStore((s) => s.settings.sampling)
  const agents = useAgentsStore((s) => s.agents)
  const draft = useChatsStore((s) => s.draft)
  const setDraft = useChatsStore((s) => s.setDraft)
  const setChatSampling = useChatsStore((s) => s.setChatSampling)

  const agentId = chat ? chat.agentId : (draft.agentId ?? undefined)
  const agent = agentId ? agents.find((a) => a.id === agentId) : undefined
  const inherited = resolveSampling(globalSampling, agent?.sampling)
  const value = (chat ? chat.sampling : draft.sampling) ?? {}
  const overrideCount = Object.keys(value).length

  function patch(p: SamplingParams) {
    if (chat) {
      setChatSampling(chat.id, p)
    } else {
      const merged = { ...draft.sampling, ...p }
      for (const k of Object.keys(merged) as (keyof SamplingParams)[]) {
        if (merged[k] === undefined) delete merged[k]
      }
      setDraft({ sampling: Object.keys(merged).length ? merged : null })
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm hover:bg-white/10 ${
          overrideCount ? 'text-accent' : 'text-gray-400'
        }`}
        aria-label="Chat sampling parameters"
        title="Sampling parameters for this chat"
      >
        <Icon name="settings" size={15} />
        {overrideCount > 0 && <span className="text-xs">{overrideCount}</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-white/10 bg-elevated p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-200">Sampling</span>
            {overrideCount > 0 && (
              <button
                onClick={() =>
                  patch(Object.fromEntries(Object.keys(value).map((k) => [k, undefined])))
                }
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Reset to defaults
              </button>
            )}
          </div>
          <SamplingFields value={value} onChange={patch} inherited={inherited} />
          <p className="mt-2 text-xs text-gray-500">
            Empty fields inherit the {agent ? 'agent / ' : ''}global defaults from Settings.
          </p>
        </div>
      )}
    </div>
  )
}
